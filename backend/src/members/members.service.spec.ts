import { ConfigService } from '@nestjs/config';
import { Leg, Prisma } from '@prisma/client';
import { money } from '../common/money';
import {
  EcardNotFoundError,
  EcardsTotalMismatchError,
} from '../ecards/ecards.errors';
import { EcardsService } from '../ecards/ecards.service';
import { MemberCodeService } from './member-code.service';
import { MembershipFeeService } from './membership-fee.service';
import {
  ContactAlreadyUsedError,
  PlacementCheckRefusedError,
  MissingContactError,
  RegistrationPaymentRefusedError,
} from './members.errors';
import { MembersService } from './members.service';
import { RegisterMemberInput } from './members.types';
import { PlacementService } from './placement.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Inscription, Prisma mocké (sans base). La course réelle sur une même position, sur une même
 * e-card, et l'atomicité du paiement sont couvertes par `members.int-spec.ts`.
 */

const SPONSOR = { id: 1, memberCode: 'NP000963' };
const UPLINE = { id: 2, memberCode: 'NP000964' };
const FEE_DT = money(100);

const INPUT: RegisterMemberInput = {
  lastName: 'Ben Salah',
  firstName: 'Mohamed',
  email: '  Mohamed@Example.TN ',
  password: 'MotDePasse123!',
  sponsorCode: 'NP000963',
  uplineCode: 'NP000964',
  leg: Leg.LEFT,
  ecardCodes: ['HHD-7Z7-JJD-77D'],
};

interface Scenario {
  sponsor?: { id: number; memberCode: string } | null;
  upline?: { id: number; memberCode: string } | null;
  occupant?: { id: number } | null;
  emailTaken?: boolean;
  phoneTaken?: boolean;
  insideNetwork?: boolean;
  createError?: unknown;
  /** Erreur levée par la consommation des e-cards (paiement refusé). */
  paymentError?: unknown;
}

function makeService(scenario: Scenario = {}) {
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
    scenario.createError
      ? Promise.reject(scenario.createError)
      : {
          id: 42,
          registeredAt: new Date(),
          status: 'REGISTERED',
          verificationStatus: 'PENDING',
          ...data,
        },
  );
  const auditCreate = jest.fn(async () => ({}));
  // Signatures explicites (…_args) : sinon `mock.calls` est typé `[][]` et l'inspection des
  // appels ci-dessous ne compile pas (`tsc --noEmit`).
  const paymentCreate = jest.fn(async (..._args: unknown[]) => ({ id: 7 }));
  const allocate = jest.fn(async () => 'NP000970');
  const consumeManyInTx = jest.fn(async (..._args: unknown[]) =>
    scenario.paymentError
      ? Promise.reject(scenario.paymentError)
      : { ecardIds: [11], totalDt: FEE_DT },
  );

  // `??` ne conviendrait pas : un scénario peut vouloir un sponsor/upline explicitement `null`.
  const sponsor = 'sponsor' in scenario ? scenario.sponsor : SPONSOR;
  const upline = 'upline' in scenario ? scenario.upline : UPLINE;

  const findUnique = jest.fn(
    async (args: { where: Record<string, unknown> }) => {
      if ('memberCode' in args.where) {
        const code = args.where.memberCode as string;
        if (code === INPUT.sponsorCode) return sponsor;
        if (code === INPUT.uplineCode) return upline;
        return null;
      }
      if ('uplineId_leg' in args.where) return scenario.occupant ?? null;
      if ('email' in args.where) return scenario.emailTaken ? { id: 9 } : null;
      if ('phone' in args.where) return scenario.phoneTaken ? { id: 9 } : null;
      return null;
    },
  );

  const tx = {
    member: { create },
    membershipPayment: { create: paymentCreate },
    auditLog: { create: auditCreate },
  };
  const prisma = {
    member: { findUnique },
    setting: {
      findUnique: jest.fn(async () => ({
        key: 'registration_fee_dt',
        value: '100',
      })),
    },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  const placement = {
    isSponsorOnPathOf: jest.fn(async () => scenario.insideNetwork ?? true),
  } as unknown as PlacementService;

  const config = {
    get: jest.fn((key: string, def?: string) =>
      key === 'BCRYPT_ROUNDS' ? '4' : def,
    ),
  } as unknown as ConfigService;

  const memberCode = { allocate } as unknown as MemberCodeService;
  const fees = new MembershipFeeService(prisma);
  const ecards = { consumeManyInTx } as unknown as EcardsService;

  return {
    service: new MembersService(
      prisma,
      config,
      placement,
      memberCode,
      fees,
      ecards,
    ),
    create,
    paymentCreate,
    allocate,
    placement,
    consumeManyInTx,
    // Exposé pour vérifier l ORDRE des contrôles : un sponsor inconnu ne doit déclencher
    // aucune lecture de position (D-061).
    findUnique,
  };
}

function uniqueViolation(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: '6',
    meta: { target },
  });
}

/**
 * ═══ L'INSCRIPTION REFUSE UN PLACEMENT SANS JAMAIS DIRE POURQUOI (D-061) ═══
 *
 * Jusqu'à la Tranche 9.5, cet endpoint — public et anonyme — répondait « Code sponsor
 * inconnu : NP000999 » ou « La position gauche sous NP000964 est déjà occupée ». La
 * pré-vérification de l'étape 3 avait beau être indistincte, il suffisait d'interroger
 * l'inscription directement pour tout apprendre : l'indistinction était décorative.
 *
 * Les tests ci-dessous comparent les refus ENTRE EUX plutôt qu'à un libellé figé — ils
 * continueront donc de protéger l'invariant après une reformulation du message.
 */
describe('MembersService.register — les quatre refus de placement sont INDISTINGUABLES', () => {
  const CAUSES = [
    ['sponsor inconnu', { sponsor: null }],
    ['upline inconnu', { upline: null }],
    ['upline hors du réseau du sponsor (D-022)', { insideNetwork: false }],
    ['position déjà occupée (D-004)', { occupant: { id: 7 } }],
  ] as const;

  it.each(CAUSES)('refuse : %s', async (_label, options) => {
    const { service, create } = makeService(options);
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(
      PlacementCheckRefusedError,
    );
    // Aucune écriture : le refus tombe AVANT la transaction.
    expect(create).not.toHaveBeenCalled();
  });

  it('rend EXACTEMENT la même réponse dans les quatre cas', async () => {
    const responses = await Promise.all(
      CAUSES.map(async ([, options]) => {
        const { service } = makeService(options);
        try {
          await service.register(INPUT);
          throw new Error('l’inscription aurait dû être refusée');
        } catch (error) {
          return error as PlacementCheckRefusedError;
        }
      }),
    );

    const [first, ...rest] = responses;
    for (const other of rest) {
      expect(other.getStatus()).toBe(first.getStatus());
      expect(other.getResponse()).toEqual(first.getResponse());
    }
  });

  it('ne recopie AUCUN code saisi dans sa réponse', async () => {
    // « La position gauche sous NP000964 » confirmait que le code avait été lu et trouvé.
    const { service } = makeService({ occupant: { id: 7 } });
    const error = await service
      .register(INPUT)
      .catch((caught: PlacementCheckRefusedError) => caught);
    const body = JSON.stringify(
      (error as PlacementCheckRefusedError).getResponse(),
    );
    expect(body).not.toContain(INPUT.sponsorCode);
    expect(body).not.toContain(INPUT.uplineCode);
  });

  it('n’interroge pas la position quand le sponsor est déjà inconnu', async () => {
    // Sans ce court-circuit, le temps de réponse distinguerait les causes que le message tait.
    const { service, findUnique } = makeService({ sponsor: null });
    await service.register(INPUT).catch(() => undefined);

    const positionLookups = findUnique.mock.calls.filter(
      (call) => 'uplineId_leg' in (call[0] as { where: object }).where,
    );
    expect(positionLookups).toHaveLength(0);
  });
});

describe('MembersService.register — validations', () => {
  it('ni e-mail ni téléphone → refusé', async () => {
    const { service } = makeService();
    await expect(
      service.register({ ...INPUT, email: undefined, phone: undefined }),
    ).rejects.toBeInstanceOf(MissingContactError);
  });

  it('e-mail déjà utilisé → ContactAlreadyUsedError', async () => {
    const { service } = makeService({ emailTaken: true });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(
      ContactAlreadyUsedError,
    );
  });
});

describe('MembersService.register — création', () => {
  it('crée un membre INSCRIT placé, sans point, e-mail normalisé, acompte figé', async () => {
    const { service, create } = makeService();
    const member = await service.register(INPUT);

    expect(member.memberCode).toBe('NP000970');
    expect(member.status).toBe('REGISTERED');
    expect(member.uplineCode).toBe('NP000964');
    expect(member.registrationPaidDt).toBe('100.000'); // l'acompte, renvoyé au portail

    const data = create.mock.calls[0][0].data;
    expect(data.status).toBe('REGISTERED');
    expect(data.email).toBe('mohamed@example.tn'); // trim + minuscules
    expect(data.uplineId).toBe(UPLINE.id);
    expect(data.sponsorId).toBe(SPONSOR.id);
    expect(data.leg).toBe(Leg.LEFT);
    expect(data.passwordHash).not.toBe(INPUT.password);
    // L'ACOMPTE est figé sur le membre (D-037) : c'est lui que l'activation déduira.
    expect((data.registrationPaidDt as Prisma.Decimal).toString()).toBe('100');
    // Aucun point n'est écrit : seule l'activation en fait circuler.
    expect(data).not.toHaveProperty('leftPoints');
  });

  it('règle les frais AVANT tout : paiement créé, e-cards consommées du montant exact', async () => {
    const { service, paymentCreate, consumeManyInTx } = makeService();
    await service.register(INPUT);

    const payment = paymentCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(payment.data.type).toBe('REGISTRATION');
    expect(payment.data.status).toBe('SETTLED'); // acquise sans validation admin (D-010)

    const consumed = consumeManyInTx.mock.calls[0][1] as {
      codes: string[];
      dueDt: Prisma.Decimal;
      membershipPaymentId: number;
    };
    expect(consumed.codes).toEqual(INPUT.ecardCodes);
    expect(consumed.dueDt.toString()).toBe('100');
    expect(consumed.membershipPaymentId).toBe(7);
  });

  it('MASQUE la cause du refus : toutes les erreurs d’e-card donnent la MÊME réponse', async () => {
    const messages = new Set<string>();
    for (const paymentError of [
      new EcardNotFoundError(),
      new EcardsTotalMismatchError(money(90), FEE_DT, 1),
    ]) {
      const { service } = makeService({ paymentError });
      const caught = await service.register(INPUT).then(
        () => null,
        (error: Error) => error,
      );
      expect(caught).toBeInstanceOf(RegistrationPaymentRefusedError);
      messages.add(caught!.message);
    }
    // Un endpoint public ne doit pas dire si un code existe : pas d'oracle d'énumération.
    expect(messages.size).toBe(1);
    expect([...messages][0]).not.toMatch(/90/); // ni la valeur des cartes fournies
  });

  it('le refus de PAIEMENT reste DISTINCT du refus de PLACEMENT (D-061)', async () => {
    // Les deux refus taisent leur cause exacte, mais ils ne disent pas la même chose : l'un
    // renvoie l'affilié à ses codes d'E-CARD, l'autre à ses codes de PARRAINAGE. Les fondre
    // en un seul message « indistinct » aurait été une fausse bonne idée — il ne saurait plus
    // quelle étape reprendre, et devrait tout resaisir.
    const refusalOf = async (scenario: Scenario): Promise<Error> => {
      const { service } = makeService(scenario);
      try {
        await service.register(INPUT);
        throw new Error('l’inscription aurait dû être refusée');
      } catch (error) {
        return error as Error;
      }
    };

    const payment = await refusalOf({ paymentError: new EcardNotFoundError() });
    const placement = await refusalOf({ occupant: { id: 7 } });

    expect(payment).toBeInstanceOf(RegistrationPaymentRefusedError);
    expect(placement).toBeInstanceOf(PlacementCheckRefusedError);
    expect(payment.message).not.toBe(placement.message);
    // Chacun oriente vers SA saisie.
    expect(payment.message).toMatch(/e-card/i);
    expect(placement.message).toMatch(/parrain/i);
  });

  it('une panne technique n’est PAS masquée en « e-card invalide »', async () => {
    const boom = new Error('connexion Postgres perdue');
    const { service } = makeService({ paymentError: boom });
    // Masquer un incident le rendrait indiagnosticable : seules les erreurs métier des
    // e-cards sont aveuglées.
    await expect(service.register(INPUT)).rejects.toBe(boom);
  });

  it('alloue le code APRÈS toutes les validations (trous de numérotation minimisés)', async () => {
    const { service, allocate, placement } = makeService();
    await service.register(INPUT);
    const checkOrder = (placement.isSponsorOnPathOf as jest.Mock).mock
      .invocationCallOrder[0];
    expect(allocate.mock.invocationCallOrder[0]).toBeGreaterThan(checkOrder);
  });
});

describe('MembersService.register — course perdue (P2002)', () => {
  it('collision sur (uplineId, leg) → MÊME refus indistinct que le pré-contrôle (D-061)', async () => {
    // C'est le chemin de la COURSE : deux inscriptions concurrentes sur la même position. S'il
    // rendait un message distinct, il suffirait de provoquer la collision pour apprendre
    // qu'une position est convoitée — ce que le contrôle applicatif refuse de dire.
    const { service } = makeService({
      createError: uniqueViolation(['uplineId', 'leg']),
    });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(
      PlacementCheckRefusedError,
    );
  });

  it('collision sur e-mail → ContactAlreadyUsedError, jamais « position occupée »', async () => {
    const { service } = makeService({
      createError: uniqueViolation(['email']),
    });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(
      ContactAlreadyUsedError,
    );
  });

  it('collision sur memberCode (bug de séquence) → remonte telle quelle, pas une erreur utilisateur', async () => {
    const error = uniqueViolation(['memberCode']);
    const { service } = makeService({ createError: error });
    await expect(service.register(INPUT)).rejects.toBe(error);
  });
});
