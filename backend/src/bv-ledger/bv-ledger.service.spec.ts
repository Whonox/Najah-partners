import { BvMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  InsufficientBalanceError,
  InvalidMovementAmountError,
  MemberNotFoundError,
  ReasonRequiredError,
} from './bv-ledger.errors';
import { BvLedgerService } from './bv-ledger.service';

/**
 * Tests unitaires du moteur de solde (Prisma mocké, sans base). Le verrou
 * `SELECT ... FOR UPDATE` et la concurrence réelle sont couverts par les tests
 * d'intégration (`*.int-spec.ts`, `npm run test:int`). Ici on vérifie la logique
 * pure : validations, invariant « jamais négatif », montant signé, balanceAfter.
 */

type LockRow = { bvBalance: number };

function makeTx(lockRows: LockRow[]) {
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 1,
    createdAt: new Date(),
    ...data,
  }));
  const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => data);
  const queryRaw = jest.fn(async () => lockRows);
  const tx = {
    $queryRaw: queryRaw,
    bvLedgerEntry: { create },
    member: { update },
  };
  return { tx, create, update, queryRaw };
}

function makePrisma(tx: unknown): PrismaService {
  return {
    // Forme interactive : $transaction(callback, options)
    $transaction: jest.fn(async (arg: (t: unknown) => unknown) => arg(tx)),
  } as unknown as PrismaService;
}

describe('BvLedgerService.recordMovement — validations', () => {
  it('rejette un ADMIN_ADJUSTMENT sans motif (ReasonRequiredError)', async () => {
    const { tx } = makeTx([{ bvBalance: 1000 }]);
    const service = new BvLedgerService(makePrisma(tx));
    await expect(
      service.recordMovement({
        memberId: 1,
        type: BvMovementType.ADMIN_ADJUSTMENT,
        amountBv: -100,
      }),
    ).rejects.toBeInstanceOf(ReasonRequiredError);
  });

  it('accepte un ADMIN_ADJUSTMENT avec motif et le trace (trimé)', async () => {
    const { tx, create } = makeTx([{ bvBalance: 1000 }]);
    const service = new BvLedgerService(makePrisma(tx));
    await service.recordMovement({
      memberId: 1,
      type: BvMovementType.ADMIN_ADJUSTMENT,
      amountBv: -100,
      reason: '  correction  ',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'correction' }),
      }),
    );
  });

  it.each([0, 1.5, Number.NaN])(
    'rejette un montant non entier ou nul (%p → InvalidMovementAmountError)',
    async (amountBv) => {
      const { tx } = makeTx([{ bvBalance: 1000 }]);
      const service = new BvLedgerService(makePrisma(tx));
      await expect(
        service.recordMovement({
          memberId: 1,
          type: BvMovementType.COMMISSION,
          amountBv,
        }),
      ).rejects.toBeInstanceOf(InvalidMovementAmountError);
    },
  );
});

describe('BvLedgerService.recordMovement — invariant solde', () => {
  it('refuse un débit qui rendrait le solde négatif (InsufficientBalanceError)', async () => {
    const { tx, create, update } = makeTx([{ bvBalance: 100 }]);
    const service = new BvLedgerService(makePrisma(tx));
    await expect(
      service.recordMovement({
        memberId: 1,
        type: BvMovementType.ECARD_CREATION,
        amountBv: -150,
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    // Aucune écriture si le débit est refusé.
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('autorise un débit qui laisse le solde exactement à zéro', async () => {
    const { tx, create, update } = makeTx([{ bvBalance: 100 }]);
    const service = new BvLedgerService(makePrisma(tx));
    await service.recordMovement({
      memberId: 1,
      type: BvMovementType.ECARD_CREATION,
      amountBv: -100,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountBv: -100, balanceAfter: 0 }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bvBalance: 0 } }),
    );
  });

  it('crédite : montant signé positif, balanceAfter = solde + montant, solde mis à jour', async () => {
    const { tx, create, update } = makeTx([{ bvBalance: 100 }]);
    const service = new BvLedgerService(makePrisma(tx));
    await service.recordMovement({
      memberId: 7,
      type: BvMovementType.COMMISSION,
      amountBv: 250,
      commissionId: 42,
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        memberId: 7,
        type: BvMovementType.COMMISSION,
        amountBv: 250,
        balanceAfter: 350,
        ecardId: null,
        commissionId: 42,
        reason: null,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { bvBalance: 350 },
    });
  });

  it('lève MemberNotFoundError si la ligne verrouillée est absente', async () => {
    const { tx } = makeTx([]); // FOR UPDATE ne renvoie aucune ligne
    const service = new BvLedgerService(makePrisma(tx));
    await expect(
      service.recordMovement({
        memberId: 999,
        type: BvMovementType.COMMISSION,
        amountBv: 100,
      }),
    ).rejects.toBeInstanceOf(MemberNotFoundError);
  });
});
