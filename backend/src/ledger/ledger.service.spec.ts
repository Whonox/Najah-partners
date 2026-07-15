import { LedgerMovementType } from '@prisma/client';
import { money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  InsufficientBalanceError,
  InvalidMovementAmountError,
  MemberNotFoundError,
  ReasonRequiredError,
} from './ledger.errors';
import { LedgerService } from './ledger.service';

/**
 * Tests unitaires du moteur de solde (Prisma mocké, sans base). Le verrou `FOR NO KEY UPDATE`
 * et la concurrence réelle sont couverts par les tests d'intégration (`*.int-spec.ts`,
 * `npm run test:int`). Ici on vérifie la logique pure : validations, invariant « jamais
 * négatif », montant signé, balanceAfterDt.
 *
 * UNITÉ : le DINAR (D-028). Le solde verrouillé est relu en TEXTE (`::text`) — le mock rend donc
 * `balanceDt` en chaîne, comme le driver.
 */

type LockRow = { balanceDt: string };

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
    ledgerEntry: { create },
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

describe('LedgerService.recordMovement — validations', () => {
  it('rejette un ADMIN_ADJUSTMENT sans motif (ReasonRequiredError)', async () => {
    const { tx } = makeTx([{ balanceDt: '1000.000' }]);
    const service = new LedgerService(makePrisma(tx));
    await expect(
      service.recordMovement({
        memberId: 1,
        type: LedgerMovementType.ADMIN_ADJUSTMENT,
        amountDt: money(-100),
      }),
    ).rejects.toBeInstanceOf(ReasonRequiredError);
  });

  it('accepte un ADMIN_ADJUSTMENT avec motif et le trace (trimé)', async () => {
    const { tx, create } = makeTx([{ balanceDt: '1000.000' }]);
    const service = new LedgerService(makePrisma(tx));
    await service.recordMovement({
      memberId: 1,
      type: LedgerMovementType.ADMIN_ADJUSTMENT,
      amountDt: money(-100),
      reason: '  correction  ',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'correction' }),
      }),
    );
  });

  it.each([0, 1.5555, Number.NaN])(
    'rejette un montant nul ou plus fin que le millime (%p → InvalidMovementAmountError)',
    async (amount) => {
      const { tx } = makeTx([{ balanceDt: '1000.000' }]);
      const service = new LedgerService(makePrisma(tx));
      await expect(
        service.recordMovement({
          memberId: 1,
          type: LedgerMovementType.COMMISSION,
          amountDt: money(amount),
        }),
      ).rejects.toBeInstanceOf(InvalidMovementAmountError);
    },
  );
});

describe('LedgerService.recordMovement — invariant solde', () => {
  it('refuse un débit qui rendrait le solde négatif (InsufficientBalanceError)', async () => {
    const { tx, create, update } = makeTx([{ balanceDt: '100.000' }]);
    const service = new LedgerService(makePrisma(tx));
    await expect(
      service.recordMovement({
        memberId: 1,
        type: LedgerMovementType.ECARD_CREATION,
        amountDt: money(-150),
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    // Aucune écriture si le débit est refusé.
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('autorise un débit qui laisse le solde exactement à zéro', async () => {
    const { tx, create, update } = makeTx([{ balanceDt: '100.000' }]);
    const service = new LedgerService(makePrisma(tx));
    await service.recordMovement({
      memberId: 1,
      type: LedgerMovementType.ECARD_CREATION,
      amountDt: money(-100),
    });
    const createArg = create.mock.calls[0][0] as {
      data: { amountDt: { toString(): string }; balanceAfterDt: { toString(): string } };
    };
    expect(createArg.data.amountDt.toString()).toBe('-100');
    expect(createArg.data.balanceAfterDt.toString()).toBe('0');
    const updateArg = update.mock.calls[0][0] as {
      data: { balanceDt: { toString(): string } };
    };
    expect(updateArg.data.balanceDt.toString()).toBe('0');
  });

  it('crédite : montant signé positif, balanceAfterDt = solde + montant, solde à jour', async () => {
    const { tx, create, update } = makeTx([{ balanceDt: '100.500' }]);
    const service = new LedgerService(makePrisma(tx));
    await service.recordMovement({
      memberId: 7,
      type: LedgerMovementType.COMMISSION,
      amountDt: money('250.250'),
      commissionId: 42,
    });
    const createArg = create.mock.calls[0][0] as {
      data: {
        memberId: number;
        type: string;
        amountDt: { toString(): string };
        balanceAfterDt: { toString(): string };
        commissionId: number;
        reason: null;
      };
    };
    expect(createArg.data.memberId).toBe(7);
    expect(createArg.data.type).toBe(LedgerMovementType.COMMISSION);
    expect(createArg.data.amountDt.toString()).toBe('250.25');
    expect(createArg.data.balanceAfterDt.toString()).toBe('350.75');
    expect(createArg.data.commissionId).toBe(42);
    const updateArg = update.mock.calls[0][0] as {
      where: { id: number };
      data: { balanceDt: { toString(): string } };
    };
    expect(updateArg.where).toEqual({ id: 7 });
    expect(updateArg.data.balanceDt.toString()).toBe('350.75');
  });

  it('lève MemberNotFoundError si la ligne verrouillée est absente', async () => {
    const { tx } = makeTx([]); // le SELECT verrouillé ne renvoie aucune ligne
    const service = new LedgerService(makePrisma(tx));
    await expect(
      service.recordMovement({
        memberId: 999,
        type: LedgerMovementType.COMMISSION,
        amountDt: money(100),
      }),
    ).rejects.toBeInstanceOf(MemberNotFoundError);
  });
});
