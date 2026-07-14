import { ConfigService } from '@nestjs/config';
import { Leg, Prisma } from '@prisma/client';
import { MemberCodeService } from './member-code.service';
import {
  ContactAlreadyUsedError,
  MissingContactError,
  PositionTakenError,
  SponsorNotFoundError,
  UplineNotFoundError,
  UplineOutsideSponsorTreeError,
} from './members.errors';
import { MembersService } from './members.service';
import { RegisterMemberInput } from './members.types';
import { PlacementService } from './placement.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Inscription, Prisma mocké (sans base). La course réelle sur une même position et la
 * contrainte d'unicité sont couvertes par `members.int-spec.ts`.
 */

const SPONSOR = { id: 1, memberCode: 'NP000963' };
const UPLINE = { id: 2, memberCode: 'NP000964' };

const INPUT: RegisterMemberInput = {
  lastName: 'Ben Salah',
  firstName: 'Mohamed',
  email: '  Mohamed@Example.TN ',
  password: 'MotDePasse123!',
  sponsorCode: 'NP000963',
  uplineCode: 'NP000964',
  leg: Leg.LEFT,
};

interface Scenario {
  sponsor?: { id: number; memberCode: string } | null;
  upline?: { id: number; memberCode: string } | null;
  occupant?: { id: number } | null;
  emailTaken?: boolean;
  phoneTaken?: boolean;
  insideNetwork?: boolean;
  createError?: unknown;
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
  const allocate = jest.fn(async () => 'NP000970');

  // `??` ne conviendrait pas : un scénario peut vouloir un sponsor/upline explicitement `null`.
  const sponsor = 'sponsor' in scenario ? scenario.sponsor : SPONSOR;
  const upline = 'upline' in scenario ? scenario.upline : UPLINE;

  const findUnique = jest.fn(async (args: { where: Record<string, unknown> }) => {
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
  });

  const tx = { member: { create }, auditLog: { create: auditCreate } };
  const prisma = {
    member: { findUnique },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  const placement = {
    isSponsorOnPathOf: jest.fn(async () => scenario.insideNetwork ?? true),
  } as unknown as PlacementService;

  const config = {
    get: jest.fn((key: string, def?: string) => (key === 'BCRYPT_ROUNDS' ? '4' : def)),
  } as unknown as ConfigService;

  const memberCode = { allocate } as unknown as MemberCodeService;

  return {
    service: new MembersService(prisma, config, placement, memberCode),
    create,
    allocate,
    placement,
  };
}

function uniqueViolation(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: '6',
    meta: { target },
  });
}

describe('MembersService.register — validations', () => {
  it('code sponsor inconnu → SponsorNotFoundError', async () => {
    const { service } = makeService({ sponsor: null });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(SponsorNotFoundError);
  });

  it('code upline inconnu → UplineNotFoundError', async () => {
    const { service } = makeService({ upline: null });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(UplineNotFoundError);
  });

  it('upline hors du réseau du sponsor → refusé (D-022)', async () => {
    const { service } = makeService({ insideNetwork: false });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(
      UplineOutsideSponsorTreeError,
    );
  });

  it('position déjà occupée → refusée sans spillover, message explicite', async () => {
    const { service, create } = makeService({ occupant: { id: 7 } });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(PositionTakenError);
    await expect(service.register(INPUT)).rejects.toThrow(/gauche sous NP000964/);
    expect(create).not.toHaveBeenCalled();
  });

  it('ni e-mail ni téléphone → refusé', async () => {
    const { service } = makeService();
    await expect(
      service.register({ ...INPUT, email: undefined, phone: undefined }),
    ).rejects.toBeInstanceOf(MissingContactError);
  });

  it('e-mail déjà utilisé → ContactAlreadyUsedError', async () => {
    const { service } = makeService({ emailTaken: true });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(ContactAlreadyUsedError);
  });
});

describe('MembersService.register — création', () => {
  it('crée un membre INSCRIT placé, sans BV, e-mail normalisé', async () => {
    const { service, create } = makeService();
    const member = await service.register(INPUT);

    expect(member.memberCode).toBe('NP000970');
    expect(member.status).toBe('REGISTERED');
    expect(member.uplineCode).toBe('NP000964');

    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBe('REGISTERED');
    expect(data.email).toBe('mohamed@example.tn'); // trim + minuscules
    expect(data.uplineId).toBe(UPLINE.id);
    expect(data.sponsorId).toBe(SPONSOR.id);
    expect(data.leg).toBe(Leg.LEFT);
    expect(data.passwordHash).not.toBe(INPUT.password);
    // Aucune valeur BV n'est écrite : seule l'activation fait circuler du BV.
    expect(data).not.toHaveProperty('bvBalance');
    expect(data).not.toHaveProperty('leftPoints');
  });

  it('alloue le code APRÈS toutes les validations (trous de numérotation minimisés)', async () => {
    const { service, allocate, placement } = makeService();
    await service.register(INPUT);
    const checkOrder =
      (placement.isSponsorOnPathOf as jest.Mock).mock.invocationCallOrder[0];
    expect(allocate.mock.invocationCallOrder[0]).toBeGreaterThan(checkOrder);
  });
});

describe('MembersService.register — course perdue (P2002)', () => {
  it('collision sur (uplineId, leg) → PositionTakenError (la DB tranche)', async () => {
    const { service } = makeService({
      createError: uniqueViolation(['uplineId', 'leg']),
    });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(PositionTakenError);
  });

  it('collision sur e-mail → ContactAlreadyUsedError, jamais « position occupée »', async () => {
    const { service } = makeService({ createError: uniqueViolation(['email']) });
    await expect(service.register(INPUT)).rejects.toBeInstanceOf(ContactAlreadyUsedError);
  });

  it('collision sur memberCode (bug de séquence) → remonte telle quelle, pas une erreur utilisateur', async () => {
    const error = uniqueViolation(['memberCode']);
    const { service } = makeService({ createError: error });
    await expect(service.register(INPUT)).rejects.toBe(error);
  });
});
