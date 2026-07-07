import { BvMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BvAdminService } from './bv-admin.service';
import { InsufficientBalanceError, ReasonRequiredError } from './bv-ledger.errors';
import { BvLedgerService } from './bv-ledger.service';

/**
 * Tests d'intégration du grand livre BV contre un VRAI Postgres (docker-compose,
 * localhost:5433). Ils exercent le verrou de ligne `SELECT ... FOR UPDATE` que
 * les tests unitaires ne peuvent pas simuler — dont le test de concurrence D-017.
 * Lancés via `npm run test:int` (config `jest-int.json`, `--runInBand`).
 */

jest.setTimeout(30_000);

describe('BvLedger — intégration (vrai Postgres)', () => {
  let prisma: PrismaService;
  let ledger: BvLedgerService;
  let bvAdmin: BvAdminService;
  const createdMemberIds: number[] = [];
  let seq = 0;

  async function createMember(bvBalance = 0): Promise<number> {
    seq += 1;
    const member = await prisma.member.create({
      data: {
        memberCode: `NP-IT-${Date.now()}-${seq}`,
        lastName: 'Test',
        firstName: 'Ledger',
        passwordHash: 'x',
        status: 'REGISTERED',
        bvBalance,
      },
      select: { id: true },
    });
    createdMemberIds.push(member.id);
    return member.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    ledger = new BvLedgerService(prisma);
    bvAdmin = new BvAdminService(prisma, ledger);
  });

  afterEach(async () => {
    if (createdMemberIds.length > 0) {
      await prisma.bvLedgerEntry.deleteMany({
        where: { memberId: { in: createdMemberIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { target: { in: createdMemberIds.map((id) => `Member:${id}`) } },
      });
      await prisma.member.deleteMany({ where: { id: { in: createdMemberIds } } });
      createdMemberIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('CONCURRENCE (D-017) : deux débits qui dépassent ensemble le solde → un seul passe', async () => {
    const memberId = await createMember(100);

    const results = await Promise.allSettled([
      ledger.recordMovement({
        memberId,
        type: BvMovementType.ECARD_CREATION,
        amountBv: -80,
      }),
      ledger.recordMovement({
        memberId,
        type: BvMovementType.ECARD_CREATION,
        amountBv: -80,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Un seul débit passe, l'autre échoue proprement — solde jamais négatif.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      InsufficientBalanceError,
    );

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { bvBalance: true },
    });
    expect(member?.bvBalance).toBe(20);

    // Une seule ligne de mouvement écrite, cohérente avec le solde.
    const entries = await prisma.bvLedgerEntry.findMany({ where: { memberId } });
    expect(entries).toHaveLength(1);
    expect(entries[0].amountBv).toBe(-80);
    expect(entries[0].balanceAfter).toBe(20);
  });

  it('CONCURRENCE N-way : 5 débits de 30 sur un solde de 100 → exactement 3 passent', async () => {
    const memberId = await createMember(100);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        ledger.recordMovement({
          memberId,
          type: BvMovementType.ECARD_CREATION,
          amountBv: -30,
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(3); // 3 × 30 = 90 ≤ 100
    expect(rejected).toHaveLength(2);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
        InsufficientBalanceError,
      );
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { bvBalance: true },
    });
    expect(member?.bvBalance).toBe(10); // 100 − 90, jamais négatif
    expect(await prisma.bvLedgerEntry.count({ where: { memberId } })).toBe(3);
  });

  it('somme des mouvements = solde courant, et balanceAfter = somme cumulée', async () => {
    const memberId = await createMember(0);
    await ledger.recordMovement({
      memberId,
      type: BvMovementType.ADMIN_GENESIS,
      amountBv: 1000,
    });
    await ledger.recordMovement({
      memberId,
      type: BvMovementType.ECARD_CREATION,
      amountBv: -300,
    });
    await ledger.recordMovement({
      memberId,
      type: BvMovementType.COMMISSION,
      amountBv: 250,
    });
    await ledger.recordMovement({
      memberId,
      type: BvMovementType.ECARD_REFUND,
      amountBv: 300,
    });

    const entries = await prisma.bvLedgerEntry.findMany({
      where: { memberId },
      orderBy: { id: 'asc' },
    });
    const sum = entries.reduce((acc, e) => acc + e.amountBv, 0);
    const balance = await ledger.getBalance(memberId);

    expect(sum).toBe(balance);
    expect(balance).toBe(1250);

    let running = 0;
    for (const entry of entries) {
      running += entry.amountBv;
      expect(entry.balanceAfter).toBe(running);
    }
  });

  it('débit sous zéro → InsufficientBalanceError, aucun mouvement, solde inchangé', async () => {
    const memberId = await createMember(50);
    await expect(
      ledger.recordMovement({
        memberId,
        type: BvMovementType.ECARD_CREATION,
        amountBv: -51,
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    expect(await ledger.getBalance(memberId)).toBe(50);
    expect(await prisma.bvLedgerEntry.count({ where: { memberId } })).toBe(0);
  });

  it('ROLLBACK : une transaction interrompue ne laisse aucun mouvement ni solde désynchronisé', async () => {
    const memberId = await createMember(100);

    await expect(
      prisma.$transaction(async (tx) => {
        await ledger.recordMovementInTx(tx, {
          memberId,
          type: BvMovementType.COMMISSION,
          amountBv: 500,
        });
        // Interruption après le mouvement : Postgres doit tout annuler.
        throw new Error('interruption simulée après le mouvement');
      }),
    ).rejects.toThrow('interruption simulée');

    expect(await ledger.getBalance(memberId)).toBe(100); // update rollbacké
    expect(await prisma.bvLedgerEntry.count({ where: { memberId } })).toBe(0); // pas de ligne partielle
  });

  it('ADMIN_ADJUSTMENT sans motif → rejeté, rien écrit', async () => {
    const memberId = await createMember(100);
    await expect(
      ledger.recordMovement({
        memberId,
        type: BvMovementType.ADMIN_ADJUSTMENT,
        amountBv: -10,
      }),
    ).rejects.toBeInstanceOf(ReasonRequiredError);

    expect(await ledger.getBalance(memberId)).toBe(100);
    expect(await prisma.bvLedgerEntry.count({ where: { memberId } })).toBe(0);
  });

  it('ajustement admin : mouvement + AuditLog atomiques et tracés', async () => {
    const memberId = await createMember(200);
    const entry = await bvAdmin.adjust({
      adminId: 7,
      memberId,
      amountBv: -50,
      reason: 'Correction de test',
    });

    expect(entry.balanceAfter).toBe(150);
    expect(entry.reason).toBe('Correction de test');
    expect(await ledger.getBalance(memberId)).toBe(150);

    const audits = await prisma.auditLog.findMany({
      where: { target: `Member:${memberId}` },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('BV_ADMIN_ADJUSTMENT');
    expect(audits[0].actor).toBe('7');
    expect(audits[0].before).toEqual({ bvBalance: 200 });
  });

  it('genèse admin : crédit ADMIN_GENESIS + audit tracés', async () => {
    const memberId = await createMember(0);
    const entry = await bvAdmin.genesis({
      adminId: 1,
      memberId,
      amountBv: 5000,
      reason: 'Amorçage réseau',
    });

    expect(entry.type).toBe(BvMovementType.ADMIN_GENESIS);
    expect(entry.balanceAfter).toBe(5000);
    expect(await ledger.getBalance(memberId)).toBe(5000);

    const audits = await prisma.auditLog.count({
      where: { target: `Member:${memberId}`, action: 'BV_ADMIN_GENESIS' },
    });
    expect(audits).toBe(1);
  });

  it('getHistory : pagination et tri (plus récent d’abord)', async () => {
    const memberId = await createMember(0);
    for (let i = 1; i <= 5; i += 1) {
      await ledger.recordMovement({
        memberId,
        type: BvMovementType.COMMISSION,
        amountBv: i * 10,
      });
    }

    const page1 = await ledger.getHistory(memberId, { page: 1, pageSize: 2 });
    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);
    // Dernier mouvement (montant 50) en tête.
    expect(page1.items[0].amountBv).toBe(50);
    expect(page1.items[0].balanceAfter).toBe(150); // 10+20+30+40+50

    const page3 = await ledger.getHistory(memberId, { page: 3, pageSize: 2 });
    expect(page3.items).toHaveLength(1);
    expect(page3.items[0].amountBv).toBe(10); // le plus ancien
  });
});
