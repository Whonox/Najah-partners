import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EcardStatus, LedgerMovementType, MemberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildNetworkPlan, summarizePlan } from './network-plan';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

/**
 * Le réseau d'amorçage (D-019 révisée : 500 comptes) contre un VRAI Postgres.
 *
 * Le seed passe par les services réels (inscription puis activation) : ce test vérifie donc
 * autant le PLAN que son exécution — la topologie qu'annonce `network-plan.ts` est-elle bien
 * celle que le moteur d'arbre a effectivement construite, et l'argent est-il resté cohérent ?
 *
 * La suite VIDE la base avant de commencer. C'est délibéré : un seed ne s'observe que sur une
 * base vierge (il refuse, à raison, de s'amorcer sur des codes déjà distribués), et un test
 * qui dépendrait de l'état laissé par un run précédent ne prouverait rien.
 */

jest.setTimeout(600_000);

const FIRST_CODE = 'NP000963';
const LAST_CODE = 'NP001462';

describe('Seed — réseau d’amorçage de 500 comptes (vrai Postgres)', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  const plan = buildNetworkPlan();
  const expected = summarizePlan(plan);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // TRUNCATE plutôt qu'une cascade applicative : les FK du projet sont volontairement en
    // `Restrict` (supprimer un membre falsifierait la comptabilité), donc aucun DELETE ordonné
    // ne peut nettoyer 500 membres et leurs e-cards. On repart de zéro, en une instruction.
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT tablename AS name FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"${t.name}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );

    app = await NestFactory.createApplicationContext(SeedModule, { logger: false });
    await app.get(SeedService).run();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('500 comptes, codes NP000963 → NP001462 sans trou', async () => {
    const members = await prisma.member.findMany({
      orderBy: { id: 'asc' },
      select: { memberCode: true },
    });
    expect(members).toHaveLength(500);
    expect(members[0].memberCode).toBe(FIRST_CODE);
    expect(members[499].memberCode).toBe(LAST_CODE);
    expect(new Set(members.map((m) => m.memberCode)).size).toBe(500);
  });

  it('UN SEUL arbre : une racine, et les 500 membres en descendent', async () => {
    const roots = await prisma.member.findMany({
      where: { uplineId: null },
      select: { memberCode: true, leg: true, sponsorId: true },
    });
    expect(roots).toHaveLength(1);
    expect(roots[0].memberCode).toBe(FIRST_CODE);
    expect(roots[0].leg).toBeNull();
    expect(roots[0].sponsorId).toBeNull();

    // Descente depuis la racine : le compte doit couvrir TOUT le monde. Un sous-arbre orphelin
    // (upline pointant sur un membre lui-même détaché) se verrait ici, et nulle part ailleurs.
    const reach = await prisma.$queryRaw<Array<{ reached: number; maxDepth: number }>>`
      WITH RECURSIVE tree AS (
        SELECT id, 0 AS depth FROM "Member" WHERE "uplineId" IS NULL
        UNION ALL
        SELECT c.id, t.depth + 1
        FROM "Member" c JOIN tree t ON c."uplineId" = t.id
        WHERE t.depth < 1000
      )
      SELECT COUNT(*)::int AS "reached", MAX(depth)::int AS "maxDepth" FROM tree
    `;
    expect(reach[0].reached).toBe(500);
    expect(reach[0].maxDepth).toBe(expected.maxDepth);
  });

  it('placement : une position (upline, jambe) par membre, jamais deux', async () => {
    const rows = await prisma.$queryRaw<Array<{ positions: number }>>`
      SELECT COUNT(DISTINCT ("uplineId", "leg"))::int AS "positions"
      FROM "Member" WHERE "uplineId" IS NOT NULL
    `;
    expect(rows[0].positions).toBe(499);
  });

  it('D-022 : le sponsor est toujours sur le chemin racine → upline', async () => {
    const rows = await prisma.$queryRaw<Array<{ violations: number }>>`
      WITH RECURSIVE path AS (
        SELECT id AS "memberId", "uplineId" AS "ancestorId", 1 AS depth
        FROM "Member" WHERE "uplineId" IS NOT NULL
        UNION ALL
        SELECT p."memberId", m."uplineId", p.depth + 1
        FROM path p JOIN "Member" m ON m.id = p."ancestorId"
        WHERE m."uplineId" IS NOT NULL AND p.depth < 1000
      )
      SELECT COUNT(*)::int AS "violations"
      FROM "Member" c
      WHERE c."uplineId" IS NOT NULL
        AND c."sponsorId" <> c."uplineId"
        AND NOT EXISTS (
          SELECT 1 FROM path p
          WHERE p."memberId" = c.id AND p."ancestorId" = c."sponsorId"
        )
    `;
    expect(rows[0].violations).toBe(0);

    // …et le cas « sponsor ≠ upline » est réellement représenté : sans lui, le réseau
    // n'exercerait que la variante dégénérée où la commission directe suit le binaire.
    const distinct = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "Member"
      WHERE "uplineId" IS NOT NULL AND "sponsorId" <> "uplineId"
    `;
    expect(distinct[0].count).toBeGreaterThan(50);
  });

  it('statuts conformes au plan, et cohérents avec le pack', async () => {
    const groups = await prisma.member.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const count = (status: MemberStatus) =>
      groups.find((g) => g.status === status)?._count._all ?? 0;

    expect(count(MemberStatus.ACTIVE)).toBe(expected.active);
    expect(count(MemberStatus.REGISTERED)).toBe(expected.registered);
    expect(count(MemberStatus.INACTIVE)).toBe(expected.inactive);

    // Un INSCRIT n'a jamais activé : ni pack, ni palier figé, ni date d'activation.
    const registered = await prisma.member.count({
      where: {
        status: MemberStatus.REGISTERED,
        OR: [
          { packId: { not: null } },
          { activationTierBv: { not: null } },
          { activatedAt: { not: null } },
        ],
      },
    });
    expect(registered).toBe(0);

    // Un gelé (D-034) a activé AVANT d'être gelé : il garde son pack et son palier.
    const frozenWithoutPack = await prisma.member.count({
      where: { status: MemberStatus.INACTIVE, packId: null },
    });
    expect(frozenWithoutPack).toBe(0);
  });

  it('propagation : la racine porte la somme EXACTE des paliers activés', async () => {
    const root = await prisma.member.findUniqueOrThrow({
      where: { memberCode: FIRST_CODE },
      select: { leftPoints: true, rightPoints: true, activationTierBv: true },
    });
    const others = await prisma.member.aggregate({
      _sum: { activationTierBv: true },
      where: { activatedAt: { not: null }, memberCode: { not: FIRST_CODE } },
    });

    expect(root.leftPoints + root.rightPoints).toBe(
      others._sum.activationTierBv ?? 0,
    );
    expect(root.leftPoints).toBeGreaterThan(0);
    expect(root.rightPoints).toBeGreaterThan(0);
  });

  it('argent : soldes à zéro, e-cards brûlées, AUCUN mouvement à la consommation (D-025)', async () => {
    const balances = await prisma.member.aggregate({
      _sum: { balanceDt: true },
      _count: { _all: true },
    });
    expect(balances._sum.balanceDt?.toString()).toBe('0');

    // Une e-card de genèse par inscription (499), toutes consommées par leur inscription.
    const ecards = await prisma.ecard.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    expect(ecards).toHaveLength(1);
    expect(ecards[0].status).toBe(EcardStatus.USED);
    expect(ecards[0]._count._all).toBe(499);

    // Le grand livre ne connaît QUE la genèse et le débit d'activation : consommer une e-card
    // n'écrit rien (D-025). Une ligne d'un autre type ici signerait un retour au modèle recharge.
    const movements = await prisma.ledgerEntry.groupBy({
      by: ['type'],
      _count: { _all: true },
    });
    const types = movements.map((m) => m.type).sort();
    expect(types).toEqual(
      [LedgerMovementType.ACTIVATION, LedgerMovementType.ADMIN_GENESIS].sort(),
    );
    for (const movement of movements) {
      expect(movement._count._all).toBe(expected.active + expected.inactive);
    }
  });

  it('le moteur a écrit ses événements (temps 1, D-035)', async () => {
    const events = await prisma.commissionEvent.groupBy({
      by: ['type'],
      _count: { _all: true },
    });
    const count = (type: string) =>
      events.find((e) => e.type === type)?._count._all ?? 0;

    // Une commission directe par activation, sauf la racine qui n'a pas de sponsor.
    expect(count('DIRECT')).toBe(expected.active + expected.inactive - 1);
    expect(count('BALANCE')).toBeGreaterThan(0);
    expect(count('STARTUP_BONUS')).toBeGreaterThan(0);

    // Aucun événement n'est encore réclamé : le run hebdomadaire n'a pas tourné.
    expect(await prisma.commissionEvent.count({ where: { runId: null } })).toBe(
      await prisma.commissionEvent.count(),
    );
  });

  it('gel (D-034) : le carry-over d’avant gel est conservé', async () => {
    const frozen = await prisma.member.findMany({
      where: { status: MemberStatus.INACTIVE },
      select: { carriedLeftPoints: true, carriedRightPoints: true },
    });
    expect(frozen).toHaveLength(expected.inactive);
    // Le gel n'a pas remis les pools à zéro : au moins un gelé a gardé du carry-over.
    expect(
      frozen.some((m) => m.carriedLeftPoints > 0 || m.carriedRightPoints > 0),
    ).toBe(true);
  });

  it('le compteur de codes reprend APRÈS le dernier code d’amorçage', async () => {
    const rows = await prisma.$queryRaw<Array<{ next: number; maxUsed: number }>>`
      SELECT (last_value + CASE WHEN is_called THEN 1 ELSE 0 END)::int AS "next",
             (SELECT COALESCE(MAX(substring("memberCode" FROM 3)::bigint), 0)::int
                FROM "Member" WHERE "memberCode" ~ '^NP[0-9]{1,15}$') AS "maxUsed"
      FROM member_code_seq
    `;
    expect(rows[0].maxUsed).toBe(1462);
    expect(rows[0].next).toBe(1463);
  });

  it('idempotent : une seconde exécution ne recrée rien', async () => {
    const before = await prisma.member.count();
    const ecardsBefore = await prisma.ecard.count();
    await app.get(SeedService).run();
    expect(await prisma.member.count()).toBe(before);
    expect(await prisma.ecard.count()).toBe(ecardsBefore);
  });
});
