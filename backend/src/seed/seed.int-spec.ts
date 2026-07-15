import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Leg, MemberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

/**
 * Le réseau d'amorçage (D-019) contre un VRAI Postgres. Le seed passe par les services réels
 * (inscription puis activation) : ce test vérifie donc aussi que la topologie qu'il produit
 * est bien celle que le moteur d'arbre calcule.
 */

jest.setTimeout(120_000);

const CODES = [
  'NP000963', 'NP000964', 'NP000965', 'NP000966', 'NP000967', 'NP000968', 'NP000969',
];
const TIER = 1000; // Silver

describe('Seed — réseau d’amorçage D-019 (vrai Postgres)', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  /** Le réseau a-t-il été créé par CE run ? (sinon, des codes ont pu être consommés depuis) */
  let freshlySeeded = false;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // Résidus d'un test précédent : des membres au code canonique SANS le compte racine.
    // Le seed refuse (à raison) de rembobiner la séquence dans ce cas ; on nettoie donc
    // le terrain. Sur une base réellement amorcée, la racine existe et rien n'est supprimé.
    const root = await prisma.member.findUnique({ where: { memberCode: 'NP000963' } });
    freshlySeeded = !root;
    if (!root) {
      const leftovers = await prisma.member.findMany({
        where: { memberCode: { startsWith: 'NP0' } },
        orderBy: { id: 'desc' }, // downlines avant uplines (FK Restrict)
        select: { id: true },
      });
      const ids = leftovers.map((m) => m.id);
      if (ids.length > 0) {
        await prisma.ledgerEntry.deleteMany({ where: { memberId: { in: ids } } });
        for (const id of ids) {
          await prisma.member.delete({ where: { id } });
        }
      }
    }

    app = await NestFactory.createApplicationContext(SeedModule, { logger: false });
    await app.get(SeedService).run();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('les 7 comptes existent, ACTIFS, avec un pack', async () => {
    const members = await prisma.member.findMany({
      where: { memberCode: { in: CODES } },
      orderBy: { memberCode: 'asc' },
    });

    expect(members.map((m) => m.memberCode)).toEqual(CODES);
    for (const member of members) {
      expect(member.status).toBe(MemberStatus.ACTIVE);
      expect(member.packId).not.toBeNull();
      expect(member.activationTierBv).toBe(TIER); // palier (POINTS) figé au snapshot
      expect(member.activatedAt).not.toBeNull();
      expect(member.balanceDt.toString()).toBe('0'); // genèse (+prix) consommée par l'activation (−prix)
    }
  });

  it('topologie : racine, 2 au niveau 2, 4 au niveau 3', async () => {
    const byCode = new Map(
      (
        await prisma.member.findMany({ where: { memberCode: { in: CODES } } })
      ).map((m) => [m.memberCode, m]),
    );
    const expectPlacement = (code: string, upline: string | null, leg: Leg | null) => {
      const member = byCode.get(code)!;
      expect(member.uplineId).toBe(upline ? byCode.get(upline)!.id : null);
      expect(member.leg).toBe(leg);
    };

    expectPlacement('NP000963', null, null);
    expectPlacement('NP000964', 'NP000963', Leg.LEFT);
    expectPlacement('NP000965', 'NP000963', Leg.RIGHT);
    expectPlacement('NP000966', 'NP000964', Leg.LEFT);
    expectPlacement('NP000967', 'NP000964', Leg.RIGHT);
    expectPlacement('NP000968', 'NP000965', Leg.LEFT);
    expectPlacement('NP000969', 'NP000965', Leg.RIGHT);
  });

  it('points propagés jusqu’à la racine, et baselines cohérentes avec l’ordre d’activation', async () => {
    const get = async (code: string) =>
      prisma.member.findUniqueOrThrow({ where: { memberCode: code } });

    // Activation feuilles → racine : chaque nœud fige sa baseline APRÈS avoir reçu les points
    // de ses downlines → aucun point éligible, le premier run ne verse rien à ce réseau.
    const root = await get('NP000963');
    expect(root.leftPoints).toBe(3 * TIER); // 964 + 966 + 967
    expect(root.rightPoints).toBe(3 * TIER); // 965 + 968 + 969
    expect(root.baselineLeft).toBe(3 * TIER);
    expect(root.baselineRight).toBe(3 * TIER);

    const level2 = await get('NP000964');
    expect(level2.leftPoints).toBe(TIER); // 966
    expect(level2.rightPoints).toBe(TIER); // 967
    expect(level2.baselineLeft).toBe(TIER);

    const leaf = await get('NP000969');
    expect(leaf.leftPoints).toBe(0);
    expect(leaf.rightPoints).toBe(0);
    expect(leaf.startupBonusRemaining).toBe(6);
  });

  it('le compteur de codes reprend APRÈS NP000969, et ne rembobine jamais', async () => {
    const rows = await prisma.$queryRaw<Array<{ next: number; maxUsed: number }>>`
      SELECT (last_value + CASE WHEN is_called THEN 1 ELSE 0 END)::int AS "next",
             (SELECT COALESCE(MAX(substring("memberCode" FROM 3)::bigint), 0)::int
                FROM "Member" WHERE "memberCode" ~ '^NP[0-9]{1,15}$') AS "maxUsed"
      FROM member_code_seq
    `;

    // D-019 : le prochain code est postérieur au dernier code d'amorçage…
    expect(rows[0].next).toBeGreaterThan(969);
    // …et postérieur à TOUT code déjà distribué (le calage ne rembobine jamais : sinon
    // une inscription ultérieure rejouerait un code existant). Les numéros peuvent
    // comporter des trous — seule l'unicité est un invariant.
    expect(rows[0].next).toBeGreaterThan(rows[0].maxUsed);

    // Sur un réseau fraîchement amorcé, le compteur repart exactement à NP000970.
    if (freshlySeeded) {
      expect(rows[0].next).toBe(970);
    }
  });

  it('idempotent : une seconde exécution ne recrée rien', async () => {
    const before = await prisma.member.count();
    await app.get(SeedService).run();
    expect(await prisma.member.count()).toBe(before);
    expect((await prisma.member.findMany({ where: { memberCode: { in: CODES } } }))).toHaveLength(7);
  });
});
