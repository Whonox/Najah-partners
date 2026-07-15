import { ConfigService } from '@nestjs/config';
import { Leg, MemberStatus, Prisma } from '@prisma/client';
import { Money, money } from '../common/money';
import { LedgerService } from '../ledger/ledger.service';
import { InsufficientBalanceError } from '../ledger/ledger.errors';
import { PrismaService } from '../prisma/prisma.service';
import { ActivationService } from './activation.service';
import { MemberCodeService } from './member-code.service';
import {
  PositionTakenError,
  UplineOutsideSponsorTreeError,
} from './members.errors';
import { MembersService } from './members.service';
import { ActivationPayment } from './members.types';
import { BalanceActivationPayment } from './payment/balance-activation-payment';
import { buildLockChainQuery, PlacementService } from './placement.service';
import { buildTree } from './tree.builder';

/**
 * Inscription, placement et activation contre un VRAI Postgres (docker-compose, 5433).
 * C'est ici — et nulle part ailleurs — que sont vérifiés le verrou de branche, la course
 * sur une position, la propagation ensembliste et l'atomicité de l'activation.
 * Lancés par `npm run test:int`.
 */

jest.setTimeout(60_000);

const PASSWORD = 'MotDePasse123!';

describe('Members — intégration (vrai Postgres)', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let placement: PlacementService;
  let members: MembersService;
  let activation: ActivationService;
  let packId: number;
  let tierBv: number; // POINTS — ce que l'arbre reçoit
  let priceDt: Money; // DINARS — ce que l'activation fait payer (D-029)

  /** Membres créés par les tests, dans l'ordre : on les supprime à l'envers (FK Restrict). */
  const created: number[] = [];
  let seq = 0;

  /** Racine isolée : chaque test travaille dans son propre arbre. */
  async function createRoot(): Promise<{ id: number; memberCode: string }> {
    seq += 1;
    const member = await prisma.$transaction(async (tx) => {
      const memberCode = await new MemberCodeService().allocate(tx);
      return tx.member.create({
        data: {
          memberCode,
          lastName: 'Racine',
          firstName: `T${seq}`,
          email: `root-${Date.now()}-${seq}@test.local`,
          passwordHash: 'x',
          status: MemberStatus.REGISTERED,
        },
        select: { id: true, memberCode: true },
      });
    });
    created.push(member.id);
    return member;
  }

  /** Inscrit un membre par le service réel (donc avec toutes ses validations). */
  async function register(
    sponsorCode: string,
    uplineCode: string,
    leg: Leg,
  ): Promise<{ id: number; memberCode: string }> {
    seq += 1;
    const member = await members.register({
      lastName: 'Test',
      firstName: `M${seq}`,
      email: `m-${Date.now()}-${seq}@test.local`,
      password: PASSWORD,
      sponsorCode,
      uplineCode,
      leg,
    });
    created.push(member.id);
    return { id: member.id, memberCode: member.memberCode };
  }

  /**
   * Approvisionne le solde du PRIX du pack (en DT) puis active — le moyen de paiement par défaut
   * (BalanceActivationPayment) débite ce prix. L'arbre, lui, reçoit le palier en POINTS (D-028).
   */
  async function fundAndActivate(
    memberId: number,
    payment?: ActivationPayment,
  ) {
    await ledger.recordMovement({
      memberId,
      type: 'ADMIN_GENESIS',
      amountDt: priceDt,
      reason: 'Test',
    });
    return activation.activate({ memberId, packId, payment });
  }

  async function points(memberId: number) {
    return prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: {
        leftPoints: true,
        rightPoints: true,
        baselineLeft: true,
        baselineRight: true,
        status: true,
        balanceDt: true,
        activationTierBv: true,
        startupBonusRemaining: true,
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const config = {
      get: jest.fn((key: string, def?: string) =>
        key === 'BCRYPT_ROUNDS' ? '4' : def,
      ),
    } as unknown as ConfigService;

    ledger = new LedgerService(prisma);
    placement = new PlacementService(prisma);
    members = new MembersService(
      prisma,
      config,
      placement,
      new MemberCodeService(),
    );
    activation = new ActivationService(
      prisma,
      placement,
      new BalanceActivationPayment(ledger),
    );

    const pack = await prisma.pack.findFirstOrThrow({
      where: { name: 'Silver' },
    });
    packId = pack.id;
    tierBv = pack.tierBv;
    priceDt = pack.priceDt;
  });

  afterEach(async () => {
    // Ordre inverse de création : un upline ne peut pas être supprimé avant ses downlines
    // (onDelete: Restrict — le placement est immuable, pas de réenracinement silencieux).
    const ids = [...created].reverse();
    created.length = 0;
    if (ids.length === 0) return;
    await prisma.ledgerEntry.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.auditLog.deleteMany({
      where: { target: { in: ids.map((id) => `Member:${id}`) } },
    });
    for (const id of ids) {
      await prisma.member.delete({ where: { id } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─────────────────────────── Inscription ───────────────────────────

  it('inscription : membre INSCRIT, code attribué, place enregistrée, AUCUN BV', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);

    const member = await prisma.member.findUniqueOrThrow({
      where: { id: child.id },
    });
    expect(member.memberCode).toMatch(/^NP\d{6}$/);
    expect(member.status).toBe(MemberStatus.REGISTERED);
    expect(member.uplineId).toBe(root.id);
    expect(member.leg).toBe(Leg.LEFT);
    expect(member.sponsorId).toBe(root.id);
    expect(member.activatedAt).toBeNull();

    // Ni argent, ni point à l'inscription (§5.2).
    expect(member.balanceDt.toString()).toBe('0');
    expect(member.leftPoints).toBe(0);
    expect(member.rightPoints).toBe(0);
    expect(
      await prisma.ledgerEntry.count({ where: { memberId: child.id } }),
    ).toBe(0);
    const rootPoints = await points(root.id);
    expect(rootPoints.leftPoints).toBe(0);
    expect(rootPoints.rightPoints).toBe(0);
  });

  it('vérification d’identité PENDING par défaut, et non bloquante', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: child.id },
    });
    expect(member.verificationStatus).toBe('PENDING');

    // D-018 : un membre PENDING s'active normalement.
    const result = await fundAndActivate(child.id);
    expect(result.memberId).toBe(child.id);
    expect((await points(child.id)).status).toBe(MemberStatus.ACTIVE);
  });

  it('position occupée → refus explicite, pas de spillover', async () => {
    const root = await createRoot();
    await register(root.memberCode, root.memberCode, Leg.LEFT);

    await expect(
      register(root.memberCode, root.memberCode, Leg.LEFT),
    ).rejects.toBeInstanceOf(PositionTakenError);

    // La jambe droite, elle, reste libre.
    await expect(
      register(root.memberCode, root.memberCode, Leg.RIGHT),
    ).resolves.toBeDefined();
  });

  it('CONCURRENCE : deux inscriptions simultanées sur la même position → une seule gagne', async () => {
    const root = await createRoot();

    const results = await Promise.allSettled([
      members.register({
        lastName: 'Course',
        firstName: 'A',
        email: `a-${Date.now()}@test.local`,
        password: PASSWORD,
        sponsorCode: root.memberCode,
        uplineCode: root.memberCode,
        leg: Leg.LEFT,
      }),
      members.register({
        lastName: 'Course',
        firstName: 'B',
        email: `b-${Date.now()}@test.local`,
        password: PASSWORD,
        sponsorCode: root.memberCode,
        uplineCode: root.memberCode,
        leg: Leg.LEFT,
      }),
    ]);

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1); // le premier inscrit l'emporte (§5.4)
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(PositionTakenError);

    for (const r of won) {
      created.push((r as PromiseFulfilledResult<{ id: number }>).value.id);
    }
    // La contrainte DB a bien tranché : une seule ligne occupe la position.
    expect(
      await prisma.member.count({
        where: { uplineId: root.id, leg: Leg.LEFT },
      }),
    ).toBe(1);
  });

  it('upline hors du réseau du sponsor → refusé (D-022)', async () => {
    const rootA = await createRoot();
    const rootB = await createRoot();
    const underB = await register(rootB.memberCode, rootB.memberCode, Leg.LEFT);
    void underB;

    // rootA parraine, mais tente de placer dans l'arbre de rootB.
    await expect(
      register(rootA.memberCode, rootB.memberCode, Leg.RIGHT),
    ).rejects.toBeInstanceOf(UplineOutsideSponsorTreeError);
  });

  it('upline = un downline (strict) du sponsor → accepté (branche récursive D-022)', async () => {
    // sponsor(root) → child → grandchild : root parraine et place sous `child`, qui est un
    // downline strict de root (≠ root). C'est la branche récursive de isSponsorOnPathOf.
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);

    await expect(
      register(root.memberCode, child.memberCode, Leg.RIGHT),
    ).resolves.toBeDefined();
  });

  // ─────────────────────────── Activation ───────────────────────────

  it('activation : baseline figée sur les points ANTÉRIEURS, exclus du calcul du membre', async () => {
    const root = await createRoot();
    const parent = await register(root.memberCode, root.memberCode, Leg.LEFT);
    // Deux downlines s'activent PENDANT que `parent` est encore INSCRIT.
    const left = await register(parent.memberCode, parent.memberCode, Leg.LEFT);
    const right = await register(
      parent.memberCode,
      parent.memberCode,
      Leg.RIGHT,
    );
    await fundAndActivate(left.id);
    await fundAndActivate(right.id);

    // Un INSCRIT accumule bien des points (D-020) : c'est ce qui donne un sens à la baseline.
    const before = await points(parent.id);
    expect(before.leftPoints).toBe(tierBv);
    expect(before.rightPoints).toBe(tierBv);
    expect(before.status).toBe(MemberStatus.REGISTERED);

    const result = await fundAndActivate(parent.id);

    const after = await points(parent.id);
    expect(after.status).toBe(MemberStatus.ACTIVE);
    expect(after.baselineLeft).toBe(tierBv); // instantané des points déjà présents
    expect(after.baselineRight).toBe(tierBv);
    expect(after.leftPoints - after.baselineLeft).toBe(0); // rien d'éligible : tout est antérieur
    expect(after.rightPoints - after.baselineRight).toBe(0);
    expect(after.startupBonusRemaining).toBe(6);
    expect(result.creditedAncestors).toBe(1); // seule la racine est au-dessus de lui
  });

  it('propagation : le palier remonte à TOUS les ancêtres, sur la BONNE jambe (jambes mixtes)', async () => {
    // racine ─(D)─ a ─(G)─ b ─(G)─ c   : l'activation de `c` doit créditer la racine à DROITE.
    const root = await createRoot();
    const a = await register(root.memberCode, root.memberCode, Leg.RIGHT);
    const b = await register(a.memberCode, a.memberCode, Leg.LEFT);
    const c = await register(b.memberCode, b.memberCode, Leg.LEFT);

    const result = await fundAndActivate(c.id);
    expect(result.creditedAncestors).toBe(3);

    const rootPoints = await points(root.id);
    expect(rootPoints.rightPoints).toBe(tierBv); // ← la faute qui paie de l'argent
    expect(rootPoints.leftPoints).toBe(0);

    const aPoints = await points(a.id);
    expect(aPoints.leftPoints).toBe(tierBv);
    expect(aPoints.rightPoints).toBe(0);

    const bPoints = await points(b.id);
    expect(bPoints.leftPoints).toBe(tierBv);

    // Le membre activé ne se crédite jamais lui-même.
    const cPoints = await points(c.id);
    expect(cPoints.leftPoints).toBe(0);
    expect(cPoints.rightPoints).toBe(0);
    // Le prix est consommé : crédité en genèse, débité à l'activation.
    expect(cPoints.balanceDt.toString()).toBe('0');
  });

  it('activation : un seul mouvement ACTIVATION, du montant exact du PRIX du pack (DT)', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await fundAndActivate(child.id);

    const entries = await prisma.ledgerEntry.findMany({
      where: { memberId: child.id },
      orderBy: { id: 'asc' },
    });
    expect(entries).toHaveLength(2); // genèse (+prix) puis activation (−prix)
    expect(entries[1].type).toBe('ACTIVATION');
    expect(entries[1].amountDt.toString()).toBe(priceDt.negated().toString());
    expect(entries[1].balanceAfterDt.toString()).toBe('0');
  });

  it('SNAPSHOT : modifier le pack après coup ne réécrit pas l’activation', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await fundAndActivate(child.id);

    const original = await prisma.pack.findUniqueOrThrow({
      where: { id: packId },
    });
    try {
      await prisma.pack.update({
        where: { id: packId },
        data: { tierBv: original.tierBv * 2 },
      });
      const member = await points(child.id);
      expect(member.activationTierBv).toBe(tierBv); // le palier figé, pas le nouveau
      const rootPoints = await points(root.id);
      expect(rootPoints.leftPoints).toBe(tierBv); // les points propagés non plus
    } finally {
      await prisma.pack.update({
        where: { id: packId },
        data: { tierBv: original.tierBv },
      });
    }
  });

  it('solde insuffisant → activation refusée, RIEN de propagé', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);

    await expect(
      activation.activate({ memberId: child.id, packId }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    const member = await points(child.id);
    expect(member.status).toBe(MemberStatus.REGISTERED);
    const rootPoints = await points(root.id);
    expect(rootPoints.leftPoints).toBe(0);
    expect(
      await prisma.ledgerEntry.count({ where: { memberId: child.id } }),
    ).toBe(0);
  });

  it('ROLLBACK : une activation interrompue ne laisse ni point propagé, ni mouvement BV', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await ledger.recordMovement({
      memberId: child.id,
      type: 'ADMIN_GENESIS',
      amountDt: priceDt,
      reason: 'Test',
    });

    // Le moyen de paiement lève APRÈS le verrou et le snapshot : tout doit être annulé.
    const failing: ActivationPayment = {
      settleInTx: async () => {
        throw new Error('e-card invalide (interruption simulée)');
      },
    };
    await expect(
      activation.activate({ memberId: child.id, packId, payment: failing }),
    ).rejects.toThrow('interruption simulée');

    const member = await points(child.id);
    expect(member.status).toBe(MemberStatus.REGISTERED);
    expect(member.balanceDt.toString()).toBe(priceDt.toString()); // la genèse, intacte
    expect(member.activationTierBv).toBeNull();

    const rootPoints = await points(root.id);
    expect(rootPoints.leftPoints).toBe(0); // aucune propagation partielle
    // Aucun mouvement ACTIVATION orphelin.
    expect(
      await prisma.ledgerEntry.count({
        where: { memberId: child.id, type: 'ACTIVATION' },
      }),
    ).toBe(0);
  });

  it('double activation du même membre → la seconde est refusée', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await fundAndActivate(child.id);
    await ledger.recordMovement({
      memberId: child.id,
      type: 'ADMIN_GENESIS',
      amountDt: priceDt,
      reason: 'Test',
    });

    await expect(
      activation.activate({ memberId: child.id, packId }),
    ).rejects.toThrow(/pas en état INSCRIT/);
    // Le palier n'a été injecté qu'une fois.
    expect((await points(root.id)).leftPoints).toBe(tierBv);
  });

  it('CONCURRENCE : deux activations partageant un ancêtre → somme exacte, aucun interblocage', async () => {
    // racine ─┬─(G) left  ─(G) leftChild
    //         └─(D) right ─(G) rightChild
    const root = await createRoot();
    const left = await register(root.memberCode, root.memberCode, Leg.LEFT);
    const right = await register(root.memberCode, root.memberCode, Leg.RIGHT);
    const leftChild = await register(
      left.memberCode,
      left.memberCode,
      Leg.LEFT,
    );
    const rightChild = await register(
      right.memberCode,
      right.memberCode,
      Leg.LEFT,
    );

    await ledger.recordMovement({
      memberId: leftChild.id,
      type: 'ADMIN_GENESIS',
      amountDt: priceDt,
      reason: 'Test',
    });
    await ledger.recordMovement({
      memberId: rightChild.id,
      type: 'ADMIN_GENESIS',
      amountDt: priceDt,
      reason: 'Test',
    });

    // Les deux transactions verrouillent la racine : sans ordre de verrouillage commun,
    // c'est exactement le scénario qui interbloque.
    const results = await Promise.allSettled([
      activation.activate({ memberId: leftChild.id, packId }),
      activation.activate({ memberId: rightChild.id, packId }),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const rootPoints = await points(root.id);
    expect(rootPoints.leftPoints).toBe(tierBv); // aucune mise à jour perdue
    expect(rootPoints.rightPoints).toBe(tierBv);
  });

  it('le verrou de branche est RÉELLEMENT posé (le plan de la VRAIE requête contient LockRows)', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);

    // On EXPLAIN la requête RÉELLE de lockChainInTx (via buildLockChainQuery), pas une copie
    // re-tapée : si quelqu'un retire la clause de verrouillage du service, ce test rougit.
    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>(
      Prisma.sql`EXPLAIN ${buildLockChainQuery(child.id)}`,
    );
    const text = plan.map((r) => r['QUERY PLAN']).join('\n');
    // LockRows = le nœud d'exécution qui prend réellement le verrou de ligne. Absent → pas de
    // verrou (vérifié : retirer FOR NO KEY UPDATE du service fait disparaître ce nœud).
    expect(text).toContain('LockRows');
  });

  // ─────────────────────────── Consultation de l'arbre ───────────────────────────

  it('sous-arbre : une seule requête, profondeur bornée, arbre imbriqué correct', async () => {
    const root = await createRoot();
    const left = await register(root.memberCode, root.memberCode, Leg.LEFT);
    const right = await register(root.memberCode, root.memberCode, Leg.RIGHT);
    const deep = await register(left.memberCode, left.memberCode, Leg.RIGHT);

    const full = buildTree(await placement.descendants(root.id, 3));
    expect(full!.left!.id).toBe(left.id);
    expect(full!.right!.id).toBe(right.id);
    expect(full!.left!.right!.id).toBe(deep.id);
    expect(full!.left!.left).toBeNull();

    // La borne de profondeur coupe bien la descente.
    const shallow = buildTree(await placement.descendants(root.id, 1));
    expect(shallow!.left!.id).toBe(left.id);
    expect(shallow!.left!.right).toBeNull();
  });

  it('sous-arbre : aucune donnée sensible ne fuit', async () => {
    const root = await createRoot();
    await register(root.memberCode, root.memberCode, Leg.LEFT);

    const rows = await placement.descendants(root.id, 2);
    for (const row of rows) {
      expect(row).not.toHaveProperty('passwordHash');
      expect(row).not.toHaveProperty('balanceDt');
      expect(row).not.toHaveProperty('idDocumentPath');
      expect(row).not.toHaveProperty('email');
    }
  });
});
