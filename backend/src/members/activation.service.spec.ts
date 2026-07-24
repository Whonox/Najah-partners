import { LedgerMovementType, MemberStatus, Prisma } from '@prisma/client';
import { CommissionEventsService } from '../commissions/commission-events.service';
import { money } from '../common/money';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivationService } from './activation.service';
import {
  MemberNotRegisteredError,
  PackUnavailableError,
} from './members.errors';
import { ActivationPayment } from './members.types';
import { BalanceActivationPayment } from './payment/balance-activation-payment';
import { PlacementService } from './placement.service';

/**
 * Séquence de la transaction d'activation, Prisma mocké. Ce qui est vérifié ici, c'est
 * l'ORDRE et les VALEURS : le verrou d'abord, le paiement avant le débit, le palier
 * SNAPSHOTÉ (en POINTS) propagé, le PRIX (en DINARS) réglé, puis les ÉVÉNEMENTS de
 * commission écrits au fil de l'eau (temps 1, D-035) dans la même transaction. Les deux
 * dimensions se croisent ici sans se convertir (D-028). La propagation réelle, le verrou
 * et l'atomicité sont couverts par `members.int-spec.ts` et `commissions.int-spec.ts`.
 */

const PACK = {
  id: 3,
  name: 'Silver',
  tierBv: 1000, // POINTS
  priceDt: money(2200), // DINARS — le prix payé (D-029)
  directCommissionDt: money(500),
  indirectCommissionDt: money(250),
  weeklyCapDt: money(10000),
  active: true,
};

/** Ancêtres tels que la propagation les rapporte (RETURNING sous verrou). */
const ANCESTORS = [
  {
    id: 1,
    distance: 0,
    status: MemberStatus.ACTIVE,
    activationTierBv: 1000,
    activationSnapshot: {},
    carriedLeftPoints: 1000,
    carriedRightPoints: 0,
    lifetimeBalanceCount: 0,
    startupBonusUsed: false,
    activatedDescendants: 1,
  },
  {
    id: 2,
    distance: 1,
    status: MemberStatus.REGISTERED,
    activationTierBv: null,
    activationSnapshot: null,
    carriedLeftPoints: 0,
    carriedRightPoints: 0,
    lifetimeBalanceCount: 0,
    startupBonusUsed: false,
    activatedDescendants: 1,
  },
];

interface Scenario {
  status?: MemberStatus;
  sponsorId?: number | null;
  sponsorStatus?: MemberStatus;
  pack?: (typeof PACK & { active: boolean }) | null;
  payment?: ActivationPayment;
}

function makeService(scenario: Scenario = {}) {
  const executeRawUnsafe = jest.fn(async () => 0);
  // Signatures explicites (…_args) : sinon `mock.calls` est typé `[][]` et l'inspection des
  // appels ci-dessous ne compile pas (`tsc --noEmit`).
  const queryRaw = jest.fn(async (..._args: unknown[]) => [
    { baselineLeft: 700, baselineRight: 300 },
  ]);
  const auditCreate = jest.fn(async (..._args: unknown[]) => ({}));
  const sponsorId =
    scenario.sponsorId === undefined ? 7 : scenario.sponsorId;
  // Depuis la Tranche 6, `activateInTx` compose DANS la transaction de l'appelant (le
  // checkout) : toutes ses lectures passent par `tx`, jamais par le client Prisma racine.
  // Deux lectures `member.findUnique` : le membre activé (avec son sponsorId), puis le
  // sponsor (éligibilité de la commission directe, évaluée à l'instant même — D-034).
  const memberFindUnique = jest.fn(
    async (args: { where: { id: number } }) =>
      args.where.id === sponsorId
        ? {
            id: sponsorId,
            status: scenario.sponsorStatus ?? MemberStatus.ACTIVE,
          }
        : {
            id: 42,
            memberCode: 'NP000970',
            status: scenario.status ?? MemberStatus.REGISTERED,
            sponsorId,
          },
  );
  const tx = {
    $executeRawUnsafe: executeRawUnsafe,
    $queryRaw: queryRaw,
    member: { findUnique: memberFindUnique },
    pack: { findUnique: jest.fn(async () => scenario.pack ?? PACK) },
    auditLog: { create: auditCreate },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  const recordMovementInTx = jest.fn(async (..._args: unknown[]) => ({
    id: 77,
    balanceAfterDt: money(0),
  }));
  const ledger = { recordMovementInTx } as unknown as LedgerService;

  const lockChainInTx = jest.fn(async () => ({
    ids: [1, 2, 42],
    ancestorCount: 2,
  }));
  const propagateInTx = jest.fn(async () => ANCESTORS);
  const placement = {
    lockChainInTx,
    propagateInTx,
  } as unknown as PlacementService;

  // Temps 1 du moteur (D-035), mocké : la mécanique des événements est testée dans
  // `commissions/` — ici on vérifie qu'il est appelé au bon moment, avec le bon contexte.
  const recordActivationEventsInTx = jest.fn(async (..._args: unknown[]) => ({
    direct: 1,
    balance: 1,
    startupBonus: 0,
    rewardPoint: 0,
  }));
  const commissionEvents = {
    recordActivationEventsInTx,
  } as unknown as CommissionEventsService;

  // Stratégie par défaut : la VRAIE `BalanceActivationPayment` (grand livre mocké). Depuis
  // D-025, c'est elle qui porte le débit ACTIVATION — plus `ActivationService` : le mocker
  // ici masquerait précisément ce que ces tests doivent voir (le débit a bien lieu, du bon
  // montant, entre le verrou et la propagation).
  const balancePayment = new BalanceActivationPayment(ledger);
  const settleInTx = jest.spyOn(balancePayment, 'settleInTx');
  const payment = (scenario.payment ??
    balancePayment) as unknown as BalanceActivationPayment;

  return {
    service: new ActivationService(
      prisma,
      placement,
      commissionEvents,
      payment,
    ),
    lockChainInTx,
    propagateInTx,
    recordMovementInTx,
    recordActivationEventsInTx,
    settleInTx,
    queryRaw,
    auditCreate,
  };
}

describe('ActivationService.activate — séquence', () => {
  it('verrouille la chaîne AVANT tout, règle le palier, propage, puis écrit les événements', async () => {
    const s = makeService();
    await s.service.activate({ memberId: 42, packId: PACK.id });

    const lock = s.lockChainInTx.mock.invocationCallOrder[0];
    const settle = s.settleInTx.mock.invocationCallOrder[0];
    const propagate = s.propagateInTx.mock.invocationCallOrder[0];
    const events = s.recordActivationEventsInTx.mock.invocationCallOrder[0];

    // Verrou (Member) toujours en premier, règlement ensuite (D-024 : Member → Ecard),
    // propagation après — rien ne remonte dans l'arbre avant que le prix soit payé — et
    // les événements de commission en dernier : ils lisent les pools APRÈS crédit (D-035).
    expect(lock).toBeLessThan(settle);
    expect(settle).toBeLessThan(propagate);
    expect(propagate).toBeLessThan(events);
  });

  it('règlement sur le solde : débite exactement le PRIX DU PACK (en DT), en mouvement ACTIVATION', async () => {
    const s = makeService();
    const result = await s.service.activate({ memberId: 42, packId: PACK.id });

    const call = s.recordMovementInTx.mock.calls[0][1] as {
      memberId: number;
      type: string;
      amountDt: Prisma.Decimal;
    };
    expect(call.memberId).toBe(42);
    expect(call.type).toBe(LedgerMovementType.ACTIVATION);
    // Le PRIX (2200 DT), pas le palier (1000 points) : un point ne se paie pas (D-029).
    expect(call.amountDt.toString()).toBe('-2200');
    expect(result.payment).toEqual({
      method: 'BALANCE',
      ledgerEntryId: 77,
      ecardId: null,
    });
  });

  it('règlement par e-card : AUCUN mouvement de solde (D-025 — la carte paie, elle ne recharge pas)', async () => {
    const ecardPayment: ActivationPayment = {
      settleInTx: jest.fn(async () => ({
        method: 'ECARD' as const,
        ledgerEntryId: null,
        ecardId: 9,
      })),
    };
    const s = makeService({ payment: ecardPayment });
    const result = await s.service.activate({
      memberId: 42,
      packId: PACK.id,
      payment: ecardPayment,
    });

    // Le membre n'est ni crédité (recharge) ni débité (il n'a rien à débiter) : le grand
    // livre reste muet. Un seul mouvement suffirait à réintroduire le modèle recharge.
    expect(s.recordMovementInTx).not.toHaveBeenCalled();
    expect(result.payment).toEqual({
      method: 'ECARD',
      ledgerEntryId: null,
      ecardId: 9,
    });
    expect(s.propagateInTx).toHaveBeenCalled(); // l'arbre est bien alimenté
  });

  it('propage le palier SNAPSHOTÉ (en POINTS) à tous les ancêtres verrouillés', async () => {
    const s = makeService();
    const result = await s.service.activate({ memberId: 42, packId: PACK.id });

    // L'arbre reçoit le palier en points (1000), jamais le prix en dinars (2200).
    expect(s.propagateInTx).toHaveBeenCalledWith(
      expect.anything(),
      42,
      PACK.tierBv,
      2, // exactement le nombre d'ancêtres verrouillés
    );
    expect(result.creditedAncestors).toBe(2);
    expect(result.snapshot).toEqual({
      packName: 'Silver',
      tierBv: 1000,
      priceDt: '2200.000',
      directCommissionDt: '500.000',
      indirectCommissionDt: '250.000',
      weeklyCapDt: '10000.000',
    });
  });

  it('temps 1 (D-035) : événements écrits avec le sponsor, le snapshot du filleul et les ancêtres propagés', async () => {
    const s = makeService({ sponsorId: 7, sponsorStatus: MemberStatus.ACTIVE });
    const result = await s.service.activate({ memberId: 42, packId: PACK.id });

    const input = s.recordActivationEventsInTx.mock.calls[0][1] as {
      sourceMemberId: number;
      sourceSnapshot: { directCommissionDt: string };
      sponsor: { id: number; status: MemberStatus } | null;
      ancestors: unknown[];
    };
    expect(input.sourceMemberId).toBe(42);
    // Le montant de la DIRECTE vient du pack DU FILLEUL, figé dans SON snapshot (§6.2).
    expect(input.sourceSnapshot.directCommissionDt).toBe('500.000');
    expect(input.sponsor).toEqual({ id: 7, status: MemberStatus.ACTIVE });
    expect(input.ancestors).toBe(ANCESTORS); // l'état relu SOUS verrou, pas une relecture
    expect(result.commissionEvents).toEqual({
      direct: 1,
      balance: 1,
      startupBonus: 0,
      rewardPoint: 0,
    });
  });

  it('membre sans sponsor (racine, seed) : aucun événement DIRECT demandé', async () => {
    const s = makeService({ sponsorId: null });
    await s.service.activate({ memberId: 42, packId: PACK.id });

    const input = s.recordActivationEventsInTx.mock.calls[0][1] as {
      sponsor: unknown;
    };
    expect(input.sponsor).toBeNull();
  });

  it('fige la baseline (calculée en SQL, sous verrou)', async () => {
    const s = makeService();
    const result = await s.service.activate({ memberId: 42, packId: PACK.id });

    expect(result.baselineLeft).toBe(700);
    expect(result.baselineRight).toBe(300);
    // baseline = points courants, calculée en SQL sous verrou (le tagged template passe le
    // tableau de fragments en premier argument).
    expect(String(s.queryRaw.mock.calls[0][0])).toContain(
      '"baselineLeft" = "leftPoints"',
    );
  });

  it('trace l’activation dans le journal d’audit, dans la même transaction', async () => {
    const s = makeService();
    await s.service.activate({ memberId: 42, packId: PACK.id });
    const arg = s.auditCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data.action).toBe('MEMBER_ACTIVATED');
    expect(arg.data.target).toBe('Member:42');
  });
});

describe('ActivationService.activate — gardes', () => {
  it('membre déjà ACTIF → refusé, aucun mouvement BV, aucune propagation, aucun événement', async () => {
    const s = makeService({ status: MemberStatus.ACTIVE });
    await expect(
      s.service.activate({ memberId: 42, packId: PACK.id }),
    ).rejects.toBeInstanceOf(MemberNotRegisteredError);

    expect(s.recordMovementInTx).not.toHaveBeenCalled();
    expect(s.propagateInTx).not.toHaveBeenCalled();
    expect(s.recordActivationEventsInTx).not.toHaveBeenCalled();
  });

  it('membre INACTIF → refusé (le renouvellement n’est pas une activation)', async () => {
    const s = makeService({ status: MemberStatus.INACTIVE });
    await expect(
      s.service.activate({ memberId: 42, packId: PACK.id }),
    ).rejects.toBeInstanceOf(MemberNotRegisteredError);
  });

  it('pack désactivé → refusé avant tout mouvement', async () => {
    const s = makeService({ pack: { ...PACK, active: false } });
    await expect(
      s.service.activate({ memberId: 42, packId: PACK.id }),
    ).rejects.toBeInstanceOf(PackUnavailableError);
    expect(s.recordMovementInTx).not.toHaveBeenCalled();
  });

  it('moyen de paiement qui échoue → rien n’est débité, propagé ni écrit', async () => {
    const failing: ActivationPayment = {
      settleInTx: jest.fn(async () => {
        throw new Error('e-card invalide');
      }),
    };
    const s = makeService({ payment: failing });
    await expect(
      s.service.activate({ memberId: 42, packId: PACK.id, payment: failing }),
    ).rejects.toThrow('e-card invalide');

    expect(s.recordMovementInTx).not.toHaveBeenCalled();
    expect(s.propagateInTx).not.toHaveBeenCalled();
    expect(s.recordActivationEventsInTx).not.toHaveBeenCalled();
  });
});
