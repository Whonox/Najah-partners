import {
  IdDocumentType,
  Leg,
  MemberStatus,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MemberCodeService } from './member-code.service';
import { MembersAdminService } from './members-admin.service';
import { MemberNotFoundError } from './members.errors';
import { DEFAULT_TREE_DEPTH, PlacementService } from './placement.service';
import { buildTree } from './tree.builder';

/**
 * Surface de LECTURE du back-office (spec §7.2.2 / §7.2.3) contre un VRAI Postgres.
 *
 * Ce que seule une vraie base peut prouver ici : la recherche insensible à la casse et la
 * borne de période se comportent comme l'admin le croit, la pagination est STABLE sous un tri
 * non unique, et surtout les drapeaux `hasLeftChild` / `hasRightChild` disent la vérité sur ce
 * qui existe AU-DELÀ de la profondeur ramenée — la propriété sur laquelle repose tout le
 * chargement à la demande de la généalogie. Lancés par `npm run test:int`.
 */

jest.setTimeout(60_000);

describe('Membres — surface admin, intégration (vrai Postgres)', () => {
  let prisma: PrismaService;
  let service: MembersAdminService;
  let placement: PlacementService;
  let codes: MemberCodeService;

  /** Membres créés, dans l'ordre : supprimés à l'envers (FK Restrict, placement immuable). */
  const created: number[] = [];
  let seq = 0;
  let packId: number;
  /** Marqueur de nom propre à l'exécution : d'autres suites peuplent la même base. */
  const RUN = `T8B${Date.now() % 100_000}`;

  /**
   * Crée un membre DIRECTEMENT en base — pas par `MembersService.register` : ces tests portent
   * sur la LECTURE, et l'inscription réelle exigerait une e-card par membre (D-036) sans rien
   * apporter à ce qu'on vérifie ici.
   */
  async function member(data: {
    upline?: number;
    leg?: Leg;
    sponsor?: number;
    status?: MemberStatus;
    lastName?: string;
    balanceDt?: string;
    registeredAt?: Date;
    withPack?: boolean;
    verification?: VerificationStatus;
    idDocumentPath?: string | null;
  }): Promise<{ id: number; memberCode: string }> {
    seq += 1;
    const row = await prisma.$transaction(async (tx) => {
      const memberCode = await codes.allocate(tx);
      return tx.member.create({
        data: {
          memberCode,
          lastName: data.lastName ?? `${RUN}-Nom`,
          firstName: `${RUN}-P${seq}`,
          email: `${RUN.toLowerCase()}-${seq}@test.local`,
          passwordHash: 'x',
          status: data.status ?? MemberStatus.REGISTERED,
          uplineId: data.upline ?? null,
          leg: data.leg ?? null,
          sponsorId: data.sponsor ?? null,
          packId: data.withPack ? packId : null,
          activationTierBv: data.withPack ? 1000 : null,
          balanceDt: data.balanceDt ?? '0',
          registeredAt: data.registeredAt,
          verificationStatus: data.verification ?? VerificationStatus.PENDING,
          idDocumentType: data.idDocumentPath ? IdDocumentType.ID_CARD : null,
          idDocumentNumber: data.idDocumentPath ? '01234567' : null,
          idDocumentPath: data.idDocumentPath ?? null,
        },
        select: { id: true, memberCode: true },
      });
    });
    created.push(row.id);
    return row;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new MembersAdminService(prisma);
    placement = new PlacementService(prisma);
    codes = new MemberCodeService();
    const pack = await prisma.pack.findFirstOrThrow({ where: { name: 'Silver' } });
    packId = pack.id;
  });

  afterEach(async () => {
    const ids = [...created].reverse();
    created.length = 0;
    for (const id of ids) {
      await prisma.member.delete({ where: { id } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─────────────────────────── Liste ───────────────────────────

  it('recherche insensible à la casse sur le NOM comme sur le CODE', async () => {
    const target = await member({ lastName: `${RUN}-Zaghouani` });

    const byName = await service.list({ search: `${RUN}-zagHOUani` });
    expect(byName.items.map((m) => m.id)).toEqual([target.id]);

    const byCode = await service.list({ search: target.memberCode.toLowerCase() });
    expect(byCode.items.map((m) => m.id)).toEqual([target.id]);
  });

  it('filtre par statut et par pack, cumulativement', async () => {
    const active = await member({ status: MemberStatus.ACTIVE, withPack: true });
    await member({ status: MemberStatus.ACTIVE }); // même statut, sans pack
    await member({ status: MemberStatus.REGISTERED, withPack: true }); // même pack, autre statut

    const page = await service.list({
      search: RUN,
      status: MemberStatus.ACTIVE,
      packId,
    });

    expect(page.items.map((m) => m.id)).toEqual([active.id]);
    expect(page.total).toBe(1);
  });

  /**
   * La borne haute d'une date NUE doit inclure la journée entière : un membre inscrit à
   * 23 h 30 le 31 doit apparaître dans « jusqu'au 31 ». Le lire en `lte` minuit l'exclurait,
   * et l'admin conclurait qu'il n'y a eu aucune inscription ce jour-là.
   */
  it('période : la borne haute inclut toute la journée', async () => {
    const inside = await member({
      registeredAt: new Date('2026-03-31T23:30:00Z'),
    });
    const outside = await member({
      registeredAt: new Date('2026-04-01T00:30:00Z'),
    });

    const page = await service.list({
      search: RUN,
      registeredFrom: '2026-03-01',
      registeredTo: '2026-03-31',
    });

    const ids = page.items.map((m) => m.id);
    expect(ids).toContain(inside.id);
    expect(ids).not.toContain(outside.id);
  });

  /**
   * Sous un tri NON UNIQUE (tous inscrits au même instant), la pagination ne doit ni
   * dupliquer ni perdre une ligne. C'est le rôle du départage par `id` : sans lui, Postgres
   * est libre de renvoyer les ex æquo dans un ordre différent à chaque requête.
   */
  it('pagination STABLE sous un tri non unique (départage par id)', async () => {
    const sameInstant = new Date('2026-02-02T12:00:00Z');
    for (let i = 0; i < 5; i += 1) {
      await member({ registeredAt: sameInstant });
    }

    const first = await service.list({
      search: RUN,
      sort: 'registeredAt',
      direction: 'asc',
      page: 1,
      pageSize: 2,
    });
    const second = await service.list({
      search: RUN,
      sort: 'registeredAt',
      direction: 'asc',
      page: 2,
      pageSize: 2,
    });
    const third = await service.list({
      search: RUN,
      sort: 'registeredAt',
      direction: 'asc',
      page: 3,
      pageSize: 2,
    });

    const seen = [...first.items, ...second.items, ...third.items].map((m) => m.id);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5); // aucun doublon, aucune perte
    expect(first.total).toBe(5);
  });

  it('trie par solde décroissant (DINARS), sans jamais passer par un flottant', async () => {
    await member({ balanceDt: '10.001' });
    const richest = await member({ balanceDt: '10.002' });

    const page = await service.list({
      search: RUN,
      sort: 'balanceDt',
      direction: 'desc',
    });

    expect(page.items[0].id).toBe(richest.id);
    expect(page.items[0].balanceDt).toBe('10.002'); // le millime distingue les deux
  });

  it('rend les downlines par jambe, la position libre restant nulle', async () => {
    const root = await member({});
    const left = await member({ upline: root.id, leg: Leg.LEFT });

    const page = await service.list({ search: root.memberCode });

    expect(page.items[0].leftDownline?.id).toBe(left.id);
    expect(page.items[0].rightDownline).toBeNull();
  });

  // ─────────────────────────── Fiche ───────────────────────────

  it('fiche : sponsor et upline de placement peuvent être DEUX membres différents', async () => {
    const sponsor = await member({});
    const upline = await member({ upline: sponsor.id, leg: Leg.LEFT });
    const child = await member({
      sponsor: sponsor.id,
      upline: upline.id,
      leg: Leg.RIGHT,
    });

    const detail = await service.getOne(child.id);

    expect(detail.sponsor?.id).toBe(sponsor.id);
    expect(detail.upline?.id).toBe(upline.id);
    expect(detail.sponsor?.id).not.toBe(detail.upline?.id);
    expect(detail.leg).toBe(Leg.RIGHT);
  });

  it('fiche : le chemin du document ne sort jamais, seul son existence est dite', async () => {
    const withDoc = await member({
      idDocumentPath: 'id-documents/2026-01/abcdef.jpg',
    });
    const without = await member({});

    const detail = await service.getOne(withDoc.id);
    expect(detail.hasIdDocument).toBe(true);
    expect(detail.idDocumentNumber).toBe('01234567');
    expect(JSON.stringify(detail)).not.toContain('id-documents/');

    expect((await service.getOne(without.id)).hasIdDocument).toBe(false);

    // La colonne, elle, est bien lisible par la route qui sert le fichier.
    await expect(service.getIdDocumentPath(withDoc.id)).resolves.toBe(
      'id-documents/2026-01/abcdef.jpg',
    );
  });

  it('membre inconnu : 404 sur la fiche comme sur le document', async () => {
    await expect(service.getOne(0)).rejects.toBeInstanceOf(MemberNotFoundError);
    await expect(service.getIdDocumentPath(0)).rejects.toBeInstanceOf(
      MemberNotFoundError,
    );
  });

  // ─────────────────────── Généalogie (§7.2.3) ───────────────────────

  /**
   * LA propriété sur laquelle repose tout le chargement à la demande : à `depth = 1`, un nœud
   * qui a des downlines PLUS BAS doit le dire, alors que son sous-arbre n'est pas ramené.
   * Sans ces drapeaux, une feuille tronquée et une vraie feuille ont la même forme, et
   * l'écran devrait charger l'arbre entier pour savoir où l'on peut descendre.
   */
  it('arbre borné : distingue une feuille RÉELLE d’une feuille TRONQUÉE', async () => {
    const root = await member({});
    const left = await member({ upline: root.id, leg: Leg.LEFT });
    const right = await member({ upline: root.id, leg: Leg.RIGHT }); // vraie feuille
    await member({ upline: left.id, leg: Leg.LEFT }); // petit-enfant, hors profondeur

    const tree = buildTree(await placement.descendants(root.id, 1))!;

    expect(tree.left!.id).toBe(left.id);
    expect(tree.left!.left).toBeNull(); // non ramené (depth = 1)
    expect(tree.left!.hasLeftChild).toBe(true); // … mais il existe : on peut descendre
    expect(tree.left!.hasRightChild).toBe(false);

    expect(tree.right!.id).toBe(right.id);
    expect(tree.right!.hasLeftChild).toBe(false); // feuille réelle
    expect(tree.right!.hasRightChild).toBe(false);

    // La racine, elle, a bien ses deux jambes ramenées ET déclarées.
    expect(tree.hasLeftChild).toBe(true);
    expect(tree.hasRightChild).toBe(true);
  });

  it('les drapeaux ne dépendent pas de la profondeur demandée', async () => {
    const root = await member({});
    const left = await member({ upline: root.id, leg: Leg.LEFT });
    await member({ upline: left.id, leg: Leg.RIGHT });

    const shallow = buildTree(await placement.descendants(root.id, 1))!;
    const deep = buildTree(
      await placement.descendants(root.id, DEFAULT_TREE_DEPTH),
    )!;

    // Même vérité sur ce qui EXISTE ; seul ce qui est RAMENÉ change.
    expect(shallow.left!.hasRightChild).toBe(true);
    expect(deep.left!.hasRightChild).toBe(true);
    expect(shallow.left!.right).toBeNull();
    expect(deep.left!.right).not.toBeNull();
  });

  it('l’arbre ne transporte NI solde NI donnée sensible (D-028 : que des points)', async () => {
    const root = await member({ balanceDt: '4242.424', idDocumentPath: 'x/y.jpg' });

    const [row] = await placement.descendants(root.id, 1);

    expect(row).not.toHaveProperty('balanceDt');
    expect(row).not.toHaveProperty('passwordHash');
    expect(row).not.toHaveProperty('idDocumentPath');
    expect(row.leftPoints).toBe(0); // les jambes, en POINTS, et rien d'autre
  });
});
