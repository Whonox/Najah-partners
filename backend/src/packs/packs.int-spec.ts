import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PackNameTakenError,
  PackNotFoundError,
  WeeklyCapBelowCommissionError,
} from './packs.errors';
import { PacksService } from './packs.service';

/**
 * Packs contre un VRAI Postgres (docker-compose, 5433). Ce que seule une vraie base peut
 * prouver ici : le `Decimal(12,3)` écrit le millime SANS arrondi silencieux, la contrainte
 * d'unicité du nom tranche réellement les doublons (y compris concurrents), et l'audit
 * conserve les montants en chaîne. Lancés par `npm run test:int`.
 */

jest.setTimeout(60_000);

describe('Packs — intégration (vrai Postgres)', () => {
  let prisma: PrismaService;
  let packs: PacksService;
  let adminId: number;

  /** Packs créés par les tests : purgés à la fin (aucun membre ne les référence). */
  const created: number[] = [];
  let seq = 0;

  function name(): string {
    seq += 1;
    return `T8B-Pack-${Date.now()}-${seq}`;
  }

  async function create(overrides: Record<string, unknown> = {}) {
    const pack = await packs.create(adminId, {
      name: name(),
      tierBv: 1000,
      priceDt: 2200,
      directCommissionDt: 500,
      indirectCommissionDt: 250,
      weeklyCapDt: 10000,
      ...overrides,
    } as Parameters<PacksService['create']>[1]);
    created.push(pack.id);
    return pack;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    packs = new PacksService(prisma);

    const admin = await prisma.adminUser.findFirstOrThrow({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    });
    adminId = admin.id;
  });

  afterEach(async () => {
    const ids = [...created];
    created.length = 0;
    if (ids.length === 0) return;
    await prisma.auditLog.deleteMany({
      where: { target: { in: ids.map((id) => `Pack:${id}`) } },
    });
    await prisma.pack.deleteMany({ where: { id: { in: ids } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crée un pack : palier en POINTS entiers, montants en DINARS au millime', async () => {
    const pack = await create({ priceDt: 2200.125, weeklyCapDt: 10000.999 });

    expect(pack.tierBv).toBe(1000);
    expect(pack.priceDt).toBe('2200.125'); // le millime survit intact
    expect(pack.weeklyCapDt).toBe('10000.999');
    expect(pack.active).toBe(true);
    expect(pack.memberCount).toBe(0);

    // Relu depuis la base : la colonne `Decimal(12,3)` n'a rien arrondi en silence.
    const row = await prisma.pack.findUniqueOrThrow({ where: { id: pack.id } });
    expect(row.priceDt.toFixed(3)).toBe('2200.125');
  });

  it('liste tous les packs, actifs ET inactifs, par palier croissant', async () => {
    const gold = await create({ tierBv: 2000 });
    const silver = await create({ tierBv: 1000, active: false });

    const list = await packs.list();
    const mine = list.filter((p) => [gold.id, silver.id].includes(p.id));

    expect(mine.map((p) => p.id)).toEqual([silver.id, gold.id]); // 1000 avant 2000
    expect(mine.find((p) => p.id === silver.id)!.active).toBe(false); // l'inactif reste listé
  });

  it('refuse un plafond sous une commission : rien n’est écrit en base', async () => {
    const before = await prisma.pack.count();

    await expect(
      packs.create(adminId, {
        name: name(),
        tierBv: 1000,
        priceDt: 2200,
        directCommissionDt: 500,
        indirectCommissionDt: 250,
        weeklyCapDt: 300,
      }),
    ).rejects.toBeInstanceOf(WeeklyCapBelowCommissionError);

    expect(await prisma.pack.count()).toBe(before);
  });

  it('deux packs du même nom : la contrainte unique refuse le second', async () => {
    const first = await create();

    await expect(
      packs.create(adminId, {
        name: first.name,
        tierBv: 2000,
        priceDt: 3350,
        directCommissionDt: 700,
        indirectCommissionDt: 400,
        weeklyCapDt: 16000,
      }),
    ).rejects.toBeInstanceOf(PackNameTakenError);
  });

  /**
   * L'invariant de SNAPSHOT (spec §5.8), vérifié de bout en bout : un membre activé porte
   * ses propres `activationTierBv` / `activationSnapshot`, et modifier le pack après coup ne
   * les touche pas. C'est ce qui rend la modification d'un pack inoffensive pour l'historique
   * — et c'est exactement ce que le back-office doit promettre à l'écran.
   */
  it('modifier un pack NE RÉÉCRIT PAS le snapshot d’un membre déjà activé', async () => {
    const pack = await create();

    const member = await prisma.member.create({
      data: {
        memberCode: `T8B${Date.now() % 1_000_000}`,
        lastName: 'Snapshot',
        firstName: 'Test',
        passwordHash: 'x',
        status: 'ACTIVE',
        packId: pack.id,
        activationTierBv: 1000,
        activationSnapshot: {
          packName: pack.name,
          tierBv: 1000,
          priceDt: '2200.000',
          registrationCreditDt: '100.000',
          amountDueDt: '2100.000',
          directCommissionDt: '500.000',
          indirectCommissionDt: '250.000',
          weeklyCapDt: '10000.000',
        },
      },
      select: { id: true },
    });

    try {
      await packs.update(adminId, pack.id, {
        tierBv: 4000,
        priceDt: 9999,
        directCommissionDt: 1,
        indirectCommissionDt: 1,
        weeklyCapDt: 50,
      });

      const after = await prisma.member.findUniqueOrThrow({
        where: { id: member.id },
        select: { activationTierBv: true, activationSnapshot: true },
      });
      expect(after.activationTierBv).toBe(1000); // pas 4000
      expect(
        (after.activationSnapshot as Record<string, unknown>).weeklyCapDt,
      ).toBe('10000.000'); // pas 50
    } finally {
      await prisma.member.delete({ where: { id: member.id } });
    }
  });

  it('compte les membres du pack : le désactiver n’en efface aucun', async () => {
    const pack = await create();
    const member = await prisma.member.create({
      data: {
        memberCode: `T8C${Date.now() % 1_000_000}`,
        lastName: 'Compte',
        firstName: 'Test',
        passwordHash: 'x',
        packId: pack.id,
      },
      select: { id: true },
    });

    try {
      const disabled = await packs.update(adminId, pack.id, { active: false });
      expect(disabled.active).toBe(false);
      expect(disabled.memberCount).toBe(1); // l'historique est toujours là
    } finally {
      await prisma.member.delete({ where: { id: member.id } });
    }
  });

  it('trace chaque écriture dans AuditLog, avec l’avant et l’après en chaîne', async () => {
    const pack = await create();
    await packs.update(adminId, pack.id, { weeklyCapDt: 12000 });

    const logs = await prisma.auditLog.findMany({
      where: { target: `Pack:${pack.id}` },
      orderBy: { id: 'asc' },
    });

    expect(logs.map((l) => l.action)).toEqual(['PACK_CREATED', 'PACK_UPDATED']);
    expect(logs[0].before).toBeNull();
    expect((logs[1].before as Prisma.JsonObject).weeklyCapDt).toBe('10000.000');
    expect((logs[1].after as Prisma.JsonObject).weeklyCapDt).toBe('12000.000');
  });

  it('pack inconnu : 404', async () => {
    await expect(packs.getOne(0)).rejects.toBeInstanceOf(PackNotFoundError);
  });
});
