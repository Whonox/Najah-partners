import { BvMovementType, MemberStatus } from '@prisma/client';
import { BvLedgerService } from '../bv-ledger/bv-ledger.service';
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
 * SNAPSHOTÉ propagé (jamais le palier vivant du pack). La propagation réelle, le verrou
 * et l'atomicité sont couverts par `members.int-spec.ts`.
 */

const PACK = {
  id: 3,
  name: 'Silver',
  tierBv: 1000,
  directCommissionBv: 500,
  indirectCommissionBv: 250,
  weeklyCapBv: 10000,
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
    auditLog: { create: auditCreate },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    setting: {
      findUnique: jest.fn(async () =>
        scenario.startupBonus === null
          ? null
          : { key: 'startup_bonus_default', value: scenario.startupBonus ?? '6' },
      ),
    },
  } as unknown as PrismaService;

  const recordMovementInTx = jest.fn(async () => ({ id: 77, balanceAfter: 0 }));
  const ledger = { recordMovementInTx } as unknown as BvLedgerService;

  const lockChainInTx = jest.fn(async () => ({ ids: [1, 2, 42], ancestorCount: 2 }));
  const propagateInTx = jest.fn(async () => [{ id: 1 }, { id: 2 }]);
  const placement = { lockChainInTx, propagateInTx } as unknown as PlacementService;

  const settleInTx = jest.fn(async () => undefined);
  const payment = (scenario.payment ?? {
    settleInTx,
  }) as unknown as BalanceActivationPayment;

  return {
    service: new ActivationService(prisma, ledger, placement, payment),
    lockChainInTx,
    propagateInTx,
    recordMovementInTx,
    settleInTx,
    queryRaw,
    auditCreate,
  };
}

describe('ActivationService.activate — séquence', () => {
  it('verrouille la chaîne AVANT tout, paie AVANT de débiter, propage APRÈS', async () => {
    const s = makeService();
    await s.service.activate({ memberId: 42, packId: PACK.id });

    const lock = s.lockChainInTx.mock.invocationCallOrder[0];
    const settle = s.settleInTx.mock.invocationCallOrder[0];
    const debit = s.recordMovementInTx.mock.invocationCallOrder[0];
    const propagate = s.propagateInTx.mock.invocationCallOrder[0];

    expect(lock).toBeLessThan(settle);
    expect(settle).toBeLessThan(debit); // le crédit e-card (T5) précédera le débit
    expect(debit).toBeLessThan(propagate);
  });

  it('débite exactement le palier, en mouvement ACTIVATION', async () => {
    const s = makeService();
    await s.service.activate({ memberId: 42, packId: PACK.id });

    expect(s.recordMovementInTx).toHaveBeenCalledWith(expect.anything(), {
      memberId: 42,
      type: BvMovementType.ACTIVATION,
      amountBv: -PACK.tierBv,
    });
  });

  it('propage le palier SNAPSHOTÉ à tous les ancêtres verrouillés', async () => {
    const s = makeService();
    const result = await s.service.activate({ memberId: 42, packId: PACK.id });

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
      directCommissionBv: 500,
      indirectCommissionBv: 250,
      weeklyCapBv: 10000,
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
    const arg = s.auditCreate.mock.calls[0][0] as { data: Record<string, unknown> };
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
