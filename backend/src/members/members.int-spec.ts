import { ConfigService } from '@nestjs/config';
import {
  EcardStatus,
  Leg,
  MemberStatus,
  MembershipPaymentStatus,
  MembershipPaymentType,
  Prisma,
} from '@prisma/client';
import { CommissionEventsService } from '../commissions/commission-events.service';
import { Money, money } from '../common/money';
import { EcardsService } from '../ecards/ecards.service';
import { LedgerService } from '../ledger/ledger.service';
import { InsufficientBalanceError } from '../ledger/ledger.errors';
import { PrismaService } from '../prisma/prisma.service';
import { ActivationService } from './activation.service';
import { MemberCodeService } from './member-code.service';
import {
  ANNUAL_RENEWAL_SETTING,
  MembershipFeeService,
  REGISTRATION_FEE_SETTING,
} from './membership-fee.service';
import {
  NothingToRenewError,
  PlacementCheckRefusedError,
  RegistrationPaymentRefusedError,
  RenewalAlreadyPendingError,
  RenewalPaymentNotPendingError,
} from './members.errors';
import { MembersService } from './members.service';
import { ActivationPayment } from './members.types';
import { BalanceActivationPayment } from './payment/balance-activation-payment';
import { buildLockChainQuery, PlacementService } from './placement.service';
import { RenewalService } from './renewal.service';
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
  let ecards: EcardsService;
  let fees: MembershipFeeService;
  let renewals: RenewalService;
  let adminId: number;
  let packId: number;
  let tierBv: number; // POINTS — ce que l'arbre reçoit
  let priceDt: Money; // DINARS — le TARIF du pack (D-029)
  let feeDt: Money; // DINARS — frais d'inscription = acompte (D-036/D-037)
  let dueDt: Money; // DINARS — ce que l'activation fait réellement payer (prix − acompte)
  let renewalDt: Money; // DINARS — renouvellement annuel (D-038)

  /** Membres créés par les tests, dans l'ordre : on les supprime à l'envers (FK Restrict). */
  const created: number[] = [];
  let seq = 0;

  /** Codes émis par les tests : purgés en fin de test, y compris ceux restés ACTIVE. */
  const createdEcards: string[] = [];

  /** E-card de genèse : de la valeur créée ex nihilo, comme en amorçage réseau (D-017b). */
  async function genesisEcard(valueDt: Money): Promise<string> {
    const ecard = await ecards.genesis({ adminId, valueDt });
    createdEcards.push(ecard.code);
    return ecard.code;
  }

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

  /**
   * Inscrit un membre par le service réel (donc avec toutes ses validations), frais réglés par
   * une e-card de genèse du montant exact (D-036) : sans e-card valide, pas d'inscription.
   */
  async function register(
    sponsorCode: string,
    uplineCode: string,
    leg: Leg,
    ecardCodes?: string[],
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
      ecardCodes: ecardCodes ?? [await genesisEcard(feeDt)],
    });
    created.push(member.id);
    return { id: member.id, memberCode: member.memberCode };
  }

  /**
   * Approvisionne le solde du MONTANT DÛ (prix du pack moins l'acompte réellement versé par ce
   * membre — D-037) puis active : le moyen de paiement par défaut (BalanceActivationPayment)
   * débite exactement ce montant. L'acompte est relu sur le membre, jamais supposé : une racine
   * créée hors inscription n'en a pas et paie le prix plein.
   */
  async function fundAndActivate(
    memberId: number,
    payment?: ActivationPayment,
  ) {
    await ledger.recordMovement({
      memberId,
      type: 'ADMIN_GENESIS',
      amountDt: await amountDueFor(memberId),
      reason: 'Test',
    });
    return activation.activate({ memberId, packId, payment });
  }

  /** Prix du pack − acompte d'inscription figé sur le membre (D-037). */
  async function amountDueFor(memberId: number): Promise<Money> {
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { registrationPaidDt: true },
    });
    return priceDt.minus(member.registrationPaidDt);
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
        carriedLeftPoints: true,
        carriedRightPoints: true,
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
    ecards = new EcardsService(prisma, ledger);
    fees = new MembershipFeeService(prisma);
    members = new MembersService(
      prisma,
      config,
      placement,
      new MemberCodeService(),
      fees,
      ecards,
    );
    activation = new ActivationService(
      prisma,
      placement,
      new CommissionEventsService(),
      new BalanceActivationPayment(ledger),
    );
    renewals = new RenewalService(prisma, fees, ecards);

    const admin = await prisma.adminUser.findFirstOrThrow({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    });
    adminId = admin.id;

    const pack = await prisma.pack.findFirstOrThrow({
      where: { name: 'Silver' },
    });
    packId = pack.id;
    tierBv = pack.tierBv;
    priceDt = pack.priceDt;
    feeDt = await fees.read(REGISTRATION_FEE_SETTING);
    dueDt = priceDt.minus(feeDt);
    renewalDt = await fees.read(ANNUAL_RENEWAL_SETTING);
  });

  afterEach(async () => {
    // Ordre inverse de création : un upline ne peut pas être supprimé avant ses downlines
    // (onDelete: Restrict — le placement est immuable, pas de réenracinement silencieux).
    const ids = [...created].reverse();
    const codes = [...createdEcards];
    created.length = 0;
    createdEcards.length = 0;
    // Les e-cards restées ACTIVE (paiement refusé, course perdue) n'ont pas de membre : on
    // les purge par code, sans balayer la table — d'autres suites tournent en parallèle.
    if (codes.length > 0) {
      await prisma.ecard.deleteMany({ where: { code: { in: codes } } });
    }
    if (ids.length === 0) return;
    // Les activations écrivent des événements de commission (temps 1, D-035) : à purger
    // avant les membres (FK Restrict — bénéficiaire comme filleul source).
    await prisma.commissionEvent.deleteMany({
      where: {
        OR: [{ memberId: { in: ids } }, { sourceMemberId: { in: ids } }],
      },
    });
    await prisma.ledgerEntry.deleteMany({ where: { memberId: { in: ids } } });
    // Les e-cards des frais d'inscription / de renouvellement (D-036, D-038) pointent vers le
    // membre (`userId`) et vers leur paiement d'adhésion : purger dans cet ordre (FK Restrict).
    await prisma.ecard.deleteMany({
      where: {
        OR: [{ userId: { in: ids } }, { creatorId: { in: ids } }],
      },
    });
    await prisma.membershipPayment.deleteMany({
      where: { memberId: { in: ids } },
    });
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

  it('vérification d’identité PENDING par défaut, et non bloquante (D-018, D-039)', async () => {
    const root = await createRoot();
    seq += 1;
    const child = await members.register({
      lastName: 'Test',
      firstName: `Pending${seq}`,
      email: `pending-${Date.now()}-${seq}@test.local`,
      password: PASSWORD,
      sponsorCode: root.memberCode,
      uplineCode: root.memberCode,
      leg: Leg.LEFT,
      ecardCodes: [await genesisEcard(feeDt)],
      idDocument: {
        type: 'ID_CARD',
        relativePath: 'test/piece.jpg',
        number: '09876543', // D-039 : numéro saisi à la main
      },
    });
    created.push(child.id);

    const member = await prisma.member.findUniqueOrThrow({
      where: { id: child.id },
    });
    expect(member.verificationStatus).toBe('PENDING');
    expect(member.idDocumentNumber).toBe('09876543');

    // D-018/D-039 : rien de tout cela ne bloque — un membre PENDING s'active normalement.
    const result = await fundAndActivate(child.id);
    expect(result.memberId).toBe(child.id);
    expect((await points(child.id)).status).toBe(MemberStatus.ACTIVE);
  });

  // ─────────────────────────── Frais d'inscription par e-card (D-036) ───────────────────────────

  it('inscription : e-cards au total EXACT → membre INSCRIT, cartes USED, acompte figé', async () => {
    const root = await createRoot();
    const code = await genesisEcard(feeDt);
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT, [
      code,
    ]);

    const member = await prisma.member.findUniqueOrThrow({
      where: { id: child.id },
    });
    expect(member.status).toBe(MemberStatus.REGISTERED);
    expect(member.registrationPaidDt.toString()).toBe(feeDt.toString());

    const ecard = await prisma.ecard.findUniqueOrThrow({ where: { code } });
    expect(ecard.status).toBe(EcardStatus.USED);
    expect(ecard.userId).toBe(child.id);
    expect(ecard.usedAt).not.toBeNull();

    // Le paiement d'adhésion trace ce que la carte a réglé : une carte brûlée sans
    // contrepartie lisible n'existe jamais.
    const payment = await prisma.membershipPayment.findFirstOrThrow({
      where: { memberId: child.id },
    });
    expect(payment.type).toBe(MembershipPaymentType.REGISTRATION);
    expect(payment.status).toBe(MembershipPaymentStatus.SETTLED); // acquise, sans admin (D-010)
    expect(payment.amountDt.toString()).toBe(feeDt.toString());
    expect(ecard.membershipPaymentId).toBe(payment.id);

    // Toujours AUCUN mouvement de grand livre : l'e-card paie, elle ne recharge rien (D-025).
    expect(
      await prisma.ledgerEntry.count({ where: { memberId: child.id } }),
    ).toBe(0);
  });

  it('inscription : PLUSIEURS e-cards cumulées (50 + 50) → acceptées (D-030)', async () => {
    const root = await createRoot();
    const half = feeDt.dividedBy(2);
    const codes = [await genesisEcard(half), await genesisEcard(half)];

    const child = await register(
      root.memberCode,
      root.memberCode,
      Leg.LEFT,
      codes,
    );

    const used = await prisma.ecard.findMany({
      where: { code: { in: codes } },
    });
    expect(used).toHaveLength(2);
    expect(used.every((e) => e.status === EcardStatus.USED)).toBe(true);
    const payment = await prisma.membershipPayment.findFirstOrThrow({
      where: { memberId: child.id },
    });
    expect(used.every((e) => e.membershipPaymentId === payment.id)).toBe(true);
  });

  it('inscription : total INFÉRIEUR ou SUPÉRIEUR → refus, e-cards intactes', async () => {
    const root = await createRoot();

    for (const wrong of [feeDt.minus(10), feeDt.plus(10)]) {
      const code = await genesisEcard(wrong);
      await expect(
        register(root.memberCode, root.memberCode, Leg.LEFT, [code]),
      ).rejects.toBeInstanceOf(RegistrationPaymentRefusedError);

      const ecard = await prisma.ecard.findUniqueOrThrow({ where: { code } });
      expect(ecard.status).toBe(EcardStatus.ACTIVE); // jamais brûlée pour rien
      expect(ecard.userId).toBeNull();
    }

    // Aucun membre n'a été créé sous cette position : elle est toujours libre.
    expect(
      await prisma.member.count({
        where: { uplineId: root.id, leg: Leg.LEFT },
      }),
    ).toBe(0);
  });

  it('inscription : erreur INDISTINCTE — code inconnu, déjà utilisé, total faux (anti-oracle)', async () => {
    const root = await createRoot();
    const spent = await genesisEcard(feeDt);
    await register(root.memberCode, root.memberCode, Leg.RIGHT, [spent]); // brûle `spent`

    const wrongTotal = await genesisEcard(feeDt.minus(1));
    const messages: string[] = [];
    for (const codes of [['ZZZ-ZZZ-ZZZ-ZZZ'], [spent], [wrongTotal]]) {
      const caught = await register(
        root.memberCode,
        root.memberCode,
        Leg.LEFT,
        codes,
      ).then(
        () => null,
        (error: Error) => error,
      );
      expect(caught).toBeInstanceOf(RegistrationPaymentRefusedError);
      messages.push(caught!.message);
    }
    // Un attaquant anonyme ne peut pas distinguer les trois cas : pas d'oracle
    // d'énumération, et la valeur d'une carte ne fuit jamais.
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).not.toMatch(/\b(inconnu|utilisée|expirée)\b/i);
  });

  it('ROLLBACK : inscription échouant après le paiement (position prise) → e-cards ACTIVE', async () => {
    const root = await createRoot();
    await register(root.memberCode, root.memberCode, Leg.LEFT); // occupe la position

    const code = await genesisEcard(feeDt);
    await expect(
      register(root.memberCode, root.memberCode, Leg.LEFT, [code]),
    ).rejects.toBeInstanceOf(PlacementCheckRefusedError);

    // La carte a bien traversé la transaction annulée : elle est intacte, réutilisable.
    const ecard = await prisma.ecard.findUniqueOrThrow({ where: { code } });
    expect(ecard.status).toBe(EcardStatus.ACTIVE);
    expect(ecard.userId).toBeNull();
    expect(ecard.membershipPaymentId).toBeNull();

    // Ni membre orphelin, ni paiement orphelin.
    expect(
      await prisma.member.count({
        where: { uplineId: root.id, leg: Leg.LEFT },
      }),
    ).toBe(1);
    const payments = await prisma.membershipPayment.count({
      where: { memberId: { in: created } },
    });
    expect(payments).toBe(1); // celui de la première inscription, et lui seul

    // Réutilisable pour de bon : la même carte règle une inscription valide.
    await expect(
      register(root.memberCode, root.memberCode, Leg.RIGHT, [code]),
    ).resolves.toBeDefined();
  });

  it('CONCURRENCE : deux inscriptions avec la MÊME e-card → une seule réussit', async () => {
    const root = await createRoot();
    const code = await genesisEcard(feeDt);

    const results = await Promise.allSettled([
      members.register({
        lastName: 'Course',
        firstName: 'Ecard-A',
        email: `ea-${Date.now()}@test.local`,
        password: PASSWORD,
        sponsorCode: root.memberCode,
        uplineCode: root.memberCode,
        leg: Leg.LEFT,
        ecardCodes: [code],
      }),
      members.register({
        lastName: 'Course',
        firstName: 'Ecard-B',
        email: `eb-${Date.now()}@test.local`,
        password: PASSWORD,
        sponsorCode: root.memberCode,
        uplineCode: root.memberCode,
        leg: Leg.RIGHT, // positions DIFFÉRENTES : seule l'e-card peut départager
        ecardCodes: [code],
      }),
    ]);

    for (const r of results) {
      if (r.status === 'fulfilled') created.push(r.value.id);
    }
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    // La carte n'a payé QU'UNE inscription — pas deux membres pour 100 DT.
    const ecard = await prisma.ecard.findUniqueOrThrow({ where: { code } });
    expect(ecard.status).toBe(EcardStatus.USED);
    expect(
      await prisma.membershipPayment.count({
        where: { memberId: { in: created } },
      }),
    ).toBe(1);
  });

  it('position occupée → refus explicite, pas de spillover', async () => {
    const root = await createRoot();
    await register(root.memberCode, root.memberCode, Leg.LEFT);

    await expect(
      register(root.memberCode, root.memberCode, Leg.LEFT),
    ).rejects.toBeInstanceOf(PlacementCheckRefusedError);

    // La jambe droite, elle, reste libre.
    await expect(
      register(root.memberCode, root.memberCode, Leg.RIGHT),
    ).resolves.toBeDefined();
  });

  it('CONCURRENCE : deux inscriptions simultanées sur la même position → une seule gagne', async () => {
    const root = await createRoot();
    // Deux e-cards DISTINCTES : c'est la position qui doit départager, pas le paiement.
    const [codeA, codeB] = [
      await genesisEcard(feeDt),
      await genesisEcard(feeDt),
    ];

    const results = await Promise.allSettled([
      members.register({
        lastName: 'Course',
        firstName: 'A',
        email: `a-${Date.now()}@test.local`,
        password: PASSWORD,
        sponsorCode: root.memberCode,
        uplineCode: root.memberCode,
        leg: Leg.LEFT,
        ecardCodes: [codeA],
      }),
      members.register({
        lastName: 'Course',
        firstName: 'B',
        email: `b-${Date.now()}@test.local`,
        password: PASSWORD,
        sponsorCode: root.memberCode,
        uplineCode: root.memberCode,
        leg: Leg.LEFT,
        ecardCodes: [codeB],
      }),
    ]);

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1); // le premier inscrit l'emporte (§5.4)
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(PlacementCheckRefusedError);

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
    ).rejects.toBeInstanceOf(PlacementCheckRefusedError);
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
    // La pool appariable (D-035) reste vide : les points d'avant activation ne comptent jamais.
    expect(after.carriedLeftPoints).toBe(0);
    expect(after.carriedRightPoints).toBe(0);
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

  it('activation : un seul mouvement ACTIVATION, du PRIX du pack MOINS l’acompte (D-037)', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await fundAndActivate(child.id);

    const entries = await prisma.ledgerEntry.findMany({
      where: { memberId: child.id },
      orderBy: { id: 'asc' },
    });
    expect(entries).toHaveLength(2); // genèse (+dû) puis activation (−dû)
    expect(entries[1].type).toBe('ACTIVATION');
    // 2200 − 100 = 2100, et surtout PAS 2200 : l'acompte a déjà été versé à l'inscription.
    expect(entries[1].amountDt.toString()).toBe(dueDt.negated().toString());
    expect(entries[1].balanceAfterDt.toString()).toBe('0');

    // Le total déboursé reste le prix du pack : acompte + solde du montant dû.
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: child.id },
      select: { registrationPaidDt: true, activationSnapshot: true },
    });
    expect(member.registrationPaidDt.plus(dueDt).toString()).toBe(
      priceDt.toString(),
    );
    const snapshot = member.activationSnapshot as Record<string, string>;
    expect(snapshot.priceDt).toBe(priceDt.toFixed(3)); // le TARIF, inchangé
    expect(snapshot.registrationCreditDt).toBe(feeDt.toFixed(3));
    expect(snapshot.amountDueDt).toBe(dueDt.toFixed(3));
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
      amountDt: dueDt,
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
    expect(member.balanceDt.toString()).toBe(dueDt.toString()); // la genèse, intacte
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
      amountDt: dueDt,
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
      amountDt: dueDt,
      reason: 'Test',
    });
    await ledger.recordMovement({
      memberId: rightChild.id,
      type: 'ADMIN_GENESIS',
      amountDt: dueDt,
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

  // ─────────────────────────── Renouvellement annuel (D-038) ───────────────────────────

  it('renouvellement : payé → EN ATTENTE, le membre reste GELÉ et ne perçoit rien', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await fundAndActivate(child.id);
    await renewals.freeze(child.id);

    const payment = await renewals.pay({
      memberId: child.id,
      ecardCodes: [await genesisEcard(renewalDt)],
    });

    expect(payment.status).toBe(MembershipPaymentStatus.PENDING_VALIDATION);
    expect(payment.amountDt).toBe(renewalDt.toFixed(3));
    expect(payment.ecardIds).toHaveLength(1);

    // LE POINT DE D-038 : payer ne dégèle pas. Sans validation admin, rien ne bouge.
    const member = await points(child.id);
    expect(member.status).toBe(MemberStatus.INACTIVE);
    expect(await renewals.listPending()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: payment.id })]),
    );
  });

  it('renouvellement : validé par l’admin → réactivé, nouvelle baseline, carry-over CONSERVÉ', async () => {
    // On fabrique du carry-over AVANT le gel : une seule jambe créditée, donc rien d'apparié.
    const root = await createRoot();
    const parent = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await fundAndActivate(parent.id);
    const left = await register(parent.memberCode, parent.memberCode, Leg.LEFT);
    await fundAndActivate(left.id);

    const beforeFreeze = await points(parent.id);
    expect(beforeFreeze.carriedLeftPoints).toBe(tierBv); // carry-over acquis
    expect(beforeFreeze.carriedRightPoints).toBe(0);

    await renewals.freeze(parent.id);

    // Des points arrivent PENDANT le gel : ils traversent, sans jamais entrer dans la pool.
    const right = await register(
      parent.memberCode,
      parent.memberCode,
      Leg.RIGHT,
    );
    await fundAndActivate(right.id);
    const frozen = await points(parent.id);
    expect(frozen.rightPoints).toBe(tierBv); // cumul à vie : les points TRAVERSENT (D-034)
    expect(frozen.carriedRightPoints).toBe(0); // mais la pool d'un gelé ne reçoit rien

    const payment = await renewals.pay({
      memberId: parent.id,
      ecardCodes: [await genesisEcard(renewalDt)],
    });
    const validated = await renewals.validate({
      paymentId: payment.id,
      adminId,
    });
    expect(validated.status).toBe(MembershipPaymentStatus.VALIDATED);
    expect(validated.validatedAt).not.toBeNull();

    const after = await points(parent.id);
    expect(after.status).toBe(MemberStatus.ACTIVE);
    // Nouvelle baseline : les points du gel ne rapporteront jamais rien (D-034).
    expect(after.baselineLeft).toBe(after.leftPoints);
    expect(after.baselineRight).toBe(after.rightPoints);
    // MAIS le carry-over d'AVANT le gel est intact — c'est l'invariant délicat de D-034.
    expect(after.carriedLeftPoints).toBe(tierBv);
    expect(after.carriedRightPoints).toBe(0);
  });

  it('renouvellement : validation NON REJOUABLE, et un INSCRIT n’a rien à renouveler', async () => {
    const root = await createRoot();
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);

    // INSCRIT : jamais activé, donc rien à renouveler (D-010).
    await expect(
      renewals.pay({
        memberId: child.id,
        ecardCodes: [await genesisEcard(renewalDt)],
      }),
    ).rejects.toBeInstanceOf(NothingToRenewError);

    await fundAndActivate(child.id);
    await renewals.freeze(child.id);
    const payment = await renewals.pay({
      memberId: child.id,
      ecardCodes: [await genesisEcard(renewalDt)],
    });

    // Un second paiement pendant qu'un autre attend brûlerait des e-cards pour rien.
    await expect(
      renewals.pay({
        memberId: child.id,
        ecardCodes: [await genesisEcard(renewalDt)],
      }),
    ).rejects.toBeInstanceOf(RenewalAlreadyPendingError);

    await renewals.validate({ paymentId: payment.id, adminId });
    // Rejouer la validation ne doit ni refiger une baseline, ni réactiver deux fois.
    await expect(
      renewals.validate({ paymentId: payment.id, adminId }),
    ).rejects.toBeInstanceOf(RenewalPaymentNotPendingError);
  });

  it('renouvellement ANTICIPÉ (membre ACTIF) : validé → échéance repoussée, carry-over intact', async () => {
    const root = await createRoot();
    const parent = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await fundAndActivate(parent.id);
    const left = await register(parent.memberCode, parent.memberCode, Leg.LEFT);
    await fundAndActivate(left.id);

    const payment = await renewals.pay({
      memberId: parent.id,
      ecardCodes: [await genesisEcard(renewalDt)],
    });
    await renewals.validate({ paymentId: payment.id, adminId });

    const after = await prisma.member.findUniqueOrThrow({
      where: { id: parent.id },
      select: {
        status: true,
        renewalAt: true,
        baselineLeft: true,
        carriedLeftPoints: true,
      },
    });
    expect(after.status).toBe(MemberStatus.ACTIVE);
    expect(after.renewalAt).not.toBeNull();
    // Il n'a jamais cessé d'apparier : surtout PAS de nouvelle baseline, et le carry-over
    // en cours reste disponible.
    expect(after.baselineLeft).toBe(0);
    expect(after.carriedLeftPoints).toBe(tierBv);
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
