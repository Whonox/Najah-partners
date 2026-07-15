import { LedgerMovementType, MemberStatus, Prisma } from '@prisma/client';
import { money } from '../common/money';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivationService } from './activation.service';
import {
  InvalidSettingError,
  MemberNotRegisteredError,
  PackUnavailableError,
} from './members.errors';
import { ActivationPayment } from './members.types';
import { BalanceActivationPayment } from './payment/balance-activation-payment';
import { PlacementService } from './placement.service';

/**
 * Séquence de la transaction d'activation, Prisma mocké. Ce qui est vérifié ici, c'est
 * l'ORDRE et les VALEURS : le verrou d'abord, le paiement avant le débit, le palier
 * SNAPSHOTÉ (en POINTS) propagé, le PRIX (en DINARS) réglé. Les deux dimensions se croisent ici
 * sans se convertir (D-028). La propagation réelle, le verrou et l'atomicité sont couverts par
 * `members.int-spec.ts`.
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

interface Scenario {
  status?: MemberStatus;
  pack?: (typeof PACK & { active: boolean }) | null;
  startupBonus?: string | null;
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
  // Depuis la Tranche 6, `activateInTx` compose DANS la transaction de l'appelant (le
  // checkout) : toutes ses lectures — paramètre système compris — passent par `tx`, jamais
  // par le client Prisma racine.
  const tx = {
    $executeRawUnsafe: executeRawUnsafe,
    $queryRaw: queryRaw,
    member: {
      findUnique: jest.fn(async () => ({
        id: 42,
        memberCode: 'NP000970',
        status: scenario.status ?? MemberStatus.REGISTERED,
      })),
    },
    pack: { findUnique: jest.fn(async () => scenario.pack ?? PACK) },
    setting: {
      findUnique: jest.fn(async () =>
        scenario.startupBonus === null
          ? null
          : {
              key: 'startup_bonus_default',
              value: scenario.startupBonus ?? '6',
            },
      ),
    },
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
  const propagateInTx = jest.fn(async () => [{ id: 1 }, { id: 2 }]);
  const placement = {
    lockChainInTx,
    propagateInTx,
  } as unknown as PlacementService;

  // Stratégie par défaut : la VRAIE `BalanceActivationPayment` (grand livre mocké). Depuis
  // D-025, c'est elle qui porte le débit ACTIVATION — plus `ActivationService` : le mocker
  // ici masquerait précisément ce que ces tests doivent voir (le débit a bien lieu, du bon
  // montant, entre le verrou et la propagation).
  const balancePayment = new BalanceActivationPayment(ledger);
  const settleInTx = jest.spyOn(balancePayment, 'settleInTx');
  const payment = (scenario.payment ??
    balancePayment) as unknown as BalanceActivationPayment;

  return {
    service: new ActivationService(prisma, placement, payment),
    lockChainInTx,
    propagateInTx,
    recordMovementInTx,
    settleInTx,
    queryRaw,
    auditCreate,
  };
}

describe('ActivationService.activate — séquence', () => {
  it('verrouille la chaîne AVANT tout, règle le palier, puis propage', async () => {
    const s = makeService();
    await s.service.activate({ memberId: 42, packId: PACK.id });

    const lock = s.lockChainInTx.mock.invocationCallOrder[0];
    const settle = s.settleInTx.mock.invocationCallOrder[0];
    const propagate = s.propagateInTx.mock.invocationCallOrder[0];

    // Verrou (Member) toujours en premier, règlement ensuite (D-024 : Member → Ecard),
    // propagation en dernier — rien ne remonte dans l'arbre avant que le palier soit payé.
    expect(lock).toBeLessThan(settle);
    expect(settle).toBeLessThan(propagate);
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

  it('fige la baseline et la réserve de bonus de démarrage', async () => {
    const s = makeService({ startupBonus: '6' });
    const result = await s.service.activate({ memberId: 42, packId: PACK.id });

    expect(result.baselineLeft).toBe(700);
    expect(result.baselineRight).toBe(300);
    expect(result.startupBonusRemaining).toBe(6);
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
  it('membre déjà ACTIF → refusé, aucun mouvement BV, aucune propagation', async () => {
    const s = makeService({ status: MemberStatus.ACTIVE });
    await expect(
      s.service.activate({ memberId: 42, packId: PACK.id }),
    ).rejects.toBeInstanceOf(MemberNotRegisteredError);

    expect(s.recordMovementInTx).not.toHaveBeenCalled();
    expect(s.propagateInTx).not.toHaveBeenCalled();
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

  it('paramètre startup_bonus_default corrompu → refuse plutôt que d’écrire NaN', async () => {
    const s = makeService({ startupBonus: 'six' });
    await expect(
      s.service.activate({ memberId: 42, packId: PACK.id }),
    ).rejects.toBeInstanceOf(InvalidSettingError);
    expect(s.recordMovementInTx).not.toHaveBeenCalled();
  });

  it('paramètre absent → réserve par défaut de 6 paliers', async () => {
    const s = makeService({ startupBonus: null });
    const result = await s.service.activate({ memberId: 42, packId: PACK.id });
    expect(result.startupBonusRemaining).toBe(6);
  });

  it('moyen de paiement qui échoue → rien n’est débité ni propagé', async () => {
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
  });
});
