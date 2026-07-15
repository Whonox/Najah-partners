import { LedgerMovementType } from '@prisma/client';
import { Money, money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerAdminService } from './ledger-admin.service';
import { InsufficientBalanceError, ReasonRequiredError } from './ledger.errors';
import { LedgerService } from './ledger.service';

/**
 * Tests d'intégration du grand livre contre un VRAI Postgres (docker-compose,
 * localhost:5433). Ils exercent le verrou de ligne `SELECT ... FOR NO KEY UPDATE` que les
 * tests unitaires ne peuvent pas simuler — dont le test de concurrence D-017.
 * Lancés via `npm run test:int` (config `jest-int.json`, `--runInBand`).
 *
 * UNITÉ : le DINAR (D-028). Soldes et montants sont des `Decimal` ; on les compare via
 * `.toString()` (deux Decimal de même valeur sont deux objets distincts).
 */

jest.setTimeout(30_000);

describe('Ledger — intégration (vrai Postgres)', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let ledgerAdmin: LedgerAdminService;
  const createdMemberIds: number[] = [];
  let seq = 0;

  async function createMember(balanceDt: Money = money(0)): Promise<number> {
    seq += 1;
    const member = await prisma.member.create({
      data: {
        memberCode: `NP-IT-${Date.now()}-${seq}`,
        lastName: 'Test',
        firstName: 'Ledger',
        passwordHash: 'x',
        status: 'REGISTERED',
        balanceDt,
      },
      select: { id: true },
    });
    createdMemberIds.push(member.id);
    return member.id;
  }

  /** Solde courant, en chaîne — pour comparer sans se soucier de l'identité des Decimal. */
  async function balanceStr(memberId: number): Promise<string> {
    return (await ledger.getBalance(memberId)).toString();
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    ledger = new LedgerService(prisma);
    ledgerAdmin = new LedgerAdminService(prisma, ledger);
  });

  afterEach(async () => {
    if (createdMemberIds.length > 0) {
      await prisma.ledgerEntry.deleteMany({
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
    const memberId = await createMember(money(100));

    const results = await Promise.allSettled([
      ledger.recordMovement({
        memberId,
        type: LedgerMovementType.ECARD_CREATION,
        amountDt: money(-80),
      }),
      ledger.recordMovement({
        memberId,
        type: LedgerMovementType.ECARD_CREATION,
        amountDt: money(-80),
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

    expect(await balanceStr(memberId)).toBe('20');

    // Une seule ligne de mouvement écrite, cohérente avec le solde.
    const entries = await prisma.ledgerEntry.findMany({ where: { memberId } });
    expect(entries).toHaveLength(1);
    expect(entries[0].amountDt.toString()).toBe('-80');
    expect(entries[0].balanceAfterDt.toString()).toBe('20');
  });

  it('CONCURRENCE N-way : 5 débits de 30 sur un solde de 100 → exactement 3 passent', async () => {
    const memberId = await createMember(money(100));

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        ledger.recordMovement({
          memberId,
          type: LedgerMovementType.ECARD_CREATION,
          amountDt: money(-30),
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

    expect(await balanceStr(memberId)).toBe('10'); // 100 − 90, jamais négatif
    expect(await prisma.ledgerEntry.count({ where: { memberId } })).toBe(3);
  });

  it('somme des mouvements = solde courant, et balanceAfterDt = somme cumulée', async () => {
    const memberId = await createMember(money(0));
    await ledger.recordMovement({
      memberId,
      type: LedgerMovementType.ADMIN_GENESIS,
      amountDt: money(1000),
    });
    await ledger.recordMovement({
      memberId,
      type: LedgerMovementType.ECARD_CREATION,
      amountDt: money(-300),
    });
    await ledger.recordMovement({
      memberId,
      type: LedgerMovementType.COMMISSION,
      amountDt: money(250),
    });
    await ledger.recordMovement({
      memberId,
      type: LedgerMovementType.ECARD_REFUND,
      amountDt: money(300),
    });

    const entries = await prisma.ledgerEntry.findMany({
      where: { memberId },
      orderBy: { id: 'asc' },
    });
    const sum = entries.reduce((acc, e) => acc.plus(e.amountDt), money(0));
    const balance = await ledger.getBalance(memberId);

    expect(sum.toString()).toBe(balance.toString());
    expect(balance.toString()).toBe('1250');

    let running = money(0);
    for (const entry of entries) {
      running = running.plus(entry.amountDt);
      expect(entry.balanceAfterDt.toString()).toBe(running.toString());
    }
  });

  it('débit sous zéro → InsufficientBalanceError, aucun mouvement, solde inchangé', async () => {
    const memberId = await createMember(money(50));
    await expect(
      ledger.recordMovement({
        memberId,
        type: LedgerMovementType.ECARD_CREATION,
        amountDt: money(-51),
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    expect(await balanceStr(memberId)).toBe('50');
    expect(await prisma.ledgerEntry.count({ where: { memberId } })).toBe(0);
  });

  it('millime : un débit à 3 décimales est écrit exactement, sans arrondi', async () => {
    const memberId = await createMember(money('10.000'));
    await ledger.recordMovement({
      memberId,
      type: LedgerMovementType.ECARD_CREATION,
      amountDt: money('-2.125'),
    });
    expect(await balanceStr(memberId)).toBe('7.875');
  });

  it('ROLLBACK : une transaction interrompue ne laisse aucun mouvement ni solde désynchronisé', async () => {
    const memberId = await createMember(money(100));

    await expect(
      prisma.$transaction(async (tx) => {
        await ledger.recordMovementInTx(tx, {
          memberId,
          type: LedgerMovementType.COMMISSION,
          amountDt: money(500),
        });
        // Interruption après le mouvement : Postgres doit tout annuler.
        throw new Error('interruption simulée après le mouvement');
      }),
    ).rejects.toThrow('interruption simulée');

    expect(await balanceStr(memberId)).toBe('100'); // update rollbacké
    expect(await prisma.ledgerEntry.count({ where: { memberId } })).toBe(0); // pas de ligne partielle
  });

  it('ADMIN_ADJUSTMENT sans motif → rejeté, rien écrit', async () => {
    const memberId = await createMember(money(100));
    await expect(
      ledger.recordMovement({
        memberId,
        type: LedgerMovementType.ADMIN_ADJUSTMENT,
        amountDt: money(-10),
      }),
    ).rejects.toBeInstanceOf(ReasonRequiredError);

    expect(await balanceStr(memberId)).toBe('100');
    expect(await prisma.ledgerEntry.count({ where: { memberId } })).toBe(0);
  });

  it('ajustement admin : mouvement + AuditLog atomiques et tracés', async () => {
    const memberId = await createMember(money(200));
    const entry = await ledgerAdmin.adjust({
      adminId: 7,
      memberId,
      amountDt: money(-50),
      reason: 'Correction de test',
    });

    expect(entry.balanceAfterDt.toString()).toBe('150');
    expect(entry.reason).toBe('Correction de test');
    expect(await balanceStr(memberId)).toBe('150');

    const audits = await prisma.auditLog.findMany({
      where: { target: `Member:${memberId}` },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('LEDGER_ADMIN_ADJUSTMENT');
    expect(audits[0].actor).toBe('7');
    expect(audits[0].before).toEqual({ balanceDt: '200.000' });
  });

  it('genèse admin : crédit ADMIN_GENESIS + audit tracés', async () => {
    const memberId = await createMember(money(0));
    const entry = await ledgerAdmin.genesis({
      adminId: 1,
      memberId,
      amountDt: money(5000),
      reason: 'Amorçage réseau',
    });

    expect(entry.type).toBe(LedgerMovementType.ADMIN_GENESIS);
    expect(entry.balanceAfterDt.toString()).toBe('5000');
    expect(await balanceStr(memberId)).toBe('5000');

    const audits = await prisma.auditLog.count({
      where: { target: `Member:${memberId}`, action: 'LEDGER_ADMIN_GENESIS' },
    });
    expect(audits).toBe(1);
  });

  it('getHistory : pagination et tri (plus récent d’abord)', async () => {
    const memberId = await createMember(money(0));
    for (let i = 1; i <= 5; i += 1) {
      await ledger.recordMovement({
        memberId,
        type: LedgerMovementType.COMMISSION,
        amountDt: money(i * 10),
      });
    }

    const page1 = await ledger.getHistory(memberId, { page: 1, pageSize: 2 });
    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);
    // Dernier mouvement (montant 50) en tête.
    expect(page1.items[0].amountDt.toString()).toBe('50');
    expect(page1.items[0].balanceAfterDt.toString()).toBe('150'); // 10+20+30+40+50

    const page3 = await ledger.getHistory(memberId, { page: 3, pageSize: 2 });
    expect(page3.items).toHaveLength(1);
    expect(page3.items[0].amountDt.toString()).toBe('10'); // le plus ancien
  });
});
