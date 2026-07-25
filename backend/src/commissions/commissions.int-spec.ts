import { ConfigService } from '@nestjs/config';
import {
  CommissionEventType,
  Leg,
  MemberStatus,
  RunStatus,
} from '@prisma/client';
import { Money, money } from '../common/money';
import { EcardsService } from '../ecards/ecards.service';
import { LedgerService } from '../ledger/ledger.service';
import { ActivationService } from '../members/activation.service';
import { MemberCodeService } from '../members/member-code.service';
import {
  MembershipFeeService,
  REGISTRATION_FEE_SETTING,
} from '../members/membership-fee.service';
import { MembersService } from '../members/members.service';
import { BalanceActivationPayment } from '../members/payment/balance-activation-payment';
import { PlacementService } from '../members/placement.service';
import { RenewalService } from '../members/renewal.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionEventsService } from './commission-events.service';
import { CommissionRunService } from './commission-run.service';
import { RunPeriod } from './period';

/**
 * LE cœur de la Tranche 7 contre un VRAI Postgres : les scénarios déterministes du moteur
 * (D-031…D-035). Chaque test construit SON arbre isolé, active par les VRAIS services
 * (temps 1 : événements au fil de l'eau), puis exécute un run sur une période synthétique
 * propre au test (temps 2 : plafond + crédit). Lancés par `npm run test:int`.
 *
 * Repères — pack Silver du seed : palier 1000 pts, directe 500 DT, indirecte 250 DT/cycle,
 * plafond 10000 DT (D-028/D-029).
 */

jest.setTimeout(180_000);

const PASSWORD = 'MotDePasse123!';

/* ═══════════════════════════════════════════════════════════════════════════════════════
   QUARANTAINE DES ÉVÉNEMENTS ÉTRANGERS — NE PAS SUPPRIMER

   ── Le problème qu'elle règle ──
   `nextPeriod()` construit une période SYNTHÉTIQUE large (maintenant − 2 h → maintenant + 1 h) :
   elle doit englober « maintenant », puisque le moteur horodate ses événements à l'instant de
   l'activation (D-035) et qu'aucun test ne peut donc les dater lui-même.

   Or un run ne réclame pas les événements DU TEST : il réclame TOUS les événements non
   réclamés de la période (`SET runId WHERE runId IS NULL`, D-035). Depuis que le réseau
   d'amorçage produit de vraies commissions (D-056 — 1781 événements pour 500 comptes), la
   suite `seed.int-spec` en laisse donc un stock frais derrière elle. À l'exécution suivante,
   le premier run de CE fichier les avalait, réglait ~212 membres du SEED, et le nettoyage —
   qui ne supprime que les commissions de SES membres — ne pouvait plus supprimer le run :
   `Commission_runId_fkey` violée, run orphelin, résidus qui s'accumulent d'un lancement à
   l'autre.

   Symptôme trompeur : le test échoue dans son NETTOYAGE, pas dans son scénario, et il passe
   quand on le lance seul. On croit à un test instable ; c'est un défaut d'isolation.

   ── Ce que la quarantaine fait ──
   Avant tout run, les événements non réclamés PRÉEXISTANTS sont décalés cent ans dans le
   passé : hors de portée de toute période synthétique. Ils sont remis en place à la fin.
   Les événements créés PAR les tests, eux, naissent après la quarantaine et restent visibles.

   ── Pourquoi ce décalage et pas autre chose ──
   Les réclamer dans un run bidon marcherait aussi, mais créerait des `Commission`, créditerait
   des soldes et demanderait une ligne `CommissionRun` à nettoyer à son tour. Les supprimer
   détruirait des données d'amorçage. Le décalage ne touche qu'une colonne, n'écrit aucune
   ligne, et se défait exactement (`− 100 ans` puis `+ 100 ans`).

   ── Pourquoi elle se rattrape elle-même ──
   Une exécution interrompue laisserait des événements au XXe siècle. Le `beforeAll` remet donc
   d'abord en place tout ce qu'il trouve avant le seuil, avant de reposer sa propre quarantaine.

   ── Si vous la supprimez ──
   `npm run test:int` passera une fois — celle où la base ne porte pas d'événements récents —
   puis échouera à chaque exécution suivante dans les deux heures. Ce n'est pas du bruit.
   ═══════════════════════════════════════════════════════════════════════════════════════ */
const QUARANTINE_YEARS = 100;
/** Tout ce qui est avant ce seuil est en quarantaine : aucune donnée réelle n'y vit. */
const QUARANTINE_THRESHOLD = '1980-01-01';

describe('Moteur de commissions — scénarios déterministes (vrai Postgres)', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let members: MembersService;
  let activation: ActivationService;
  let renewal: RenewalService;
  let runs: CommissionRunService;
  let ecards: EcardsService;
  let fees: MembershipFeeService;
  let adminId: number;

  let silverId: number;
  let silverPrice: ReturnType<typeof money>;
  let feeDt: Money; // DINARS — frais d'inscription = acompte (D-036/D-037)

  const createdMembers: number[] = [];
  const createdPacks: number[] = [];
  const createdRuns: number[] = [];
  const createdEcards: number[] = [];
  let seq = 0;
  let periodSeq = 0;

  /**
   * Période synthétique UNIQUE par appel : englobe « maintenant » (les événements du test),
   * avec une borne de fin distincte à chaque run — deux tests ne partagent jamais une
   * période, donc jamais un « déjà exécuté ». La réclamation (runId IS NULL) garantit de
   * toute façon qu'un événement déjà réglé ne peut pas être repayé.
   */
  function nextPeriod(): RunPeriod {
    periodSeq += 1;
    const now = Date.now();
    return {
      start: new Date(now - 2 * 3600_000),
      end: new Date(now + 3600_000 + periodSeq * 60_000),
    };
  }

  async function runPeriod(): Promise<Awaited<ReturnType<CommissionRunService['runForPeriod']>>> {
    const result = await runs.runForPeriod(nextPeriod());
    createdRuns.push(result.runId);
    return result;
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
          firstName: `C${seq}`,
          email: `commission-root-${Date.now()}-${seq}@test.local`,
          passwordHash: 'x',
          status: MemberStatus.REGISTERED,
        },
        select: { id: true, memberCode: true },
      });
    });
    createdMembers.push(member.id);
    return member;
  }

  /**
   * Inscrit par le service réel (validations D-021/D-022 comprises), frais d'inscription
   * réglés par e-card de genèse (D-036) : sans elle, pas d'inscription.
   */
  async function register(
    sponsorCode: string,
    uplineCode: string,
    leg: Leg,
  ): Promise<{ id: number; memberCode: string }> {
    seq += 1;
    const fee = await ecards.genesis({ adminId, valueDt: feeDt });
    createdEcards.push(fee.id);
    const member = await members.register({
      lastName: 'Test',
      firstName: `C${seq}`,
      email: `commission-${Date.now()}-${seq}@test.local`,
      password: PASSWORD,
      sponsorCode,
      uplineCode,
      leg,
      ecardCodes: [fee.code],
    });
    createdMembers.push(member.id);
    return { id: member.id, memberCode: member.memberCode };
  }

  /**
   * Approvisionne le MONTANT DÛ (prix du pack − acompte d'inscription, D-037) puis active —
   * la voie solde (seed/tests). L'acompte est relu sur le membre : une racine créée hors
   * inscription n'en a pas et paie le prix plein.
   */
  async function fundAndActivate(memberId: number, packId = silverId) {
    const pack = await prisma.pack.findUniqueOrThrow({ where: { id: packId } });
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { registrationPaidDt: true },
    });
    await ledger.recordMovement({
      memberId,
      type: 'ADMIN_GENESIS',
      amountDt: pack.priceDt.minus(member.registrationPaidDt),
      reason: 'Test moteur de commissions',
    });
    return activation.activate({ memberId, packId });
  }

  /** Inscrit puis active dans la foulée (sponsor = upline). */
  async function addActive(
    parentCode: string,
    leg: Leg,
    packId = silverId,
  ): Promise<{ id: number; memberCode: string }> {
    const member = await register(parentCode, parentCode, leg);
    await fundAndActivate(member.id, packId);
    return member;
  }

  async function state(memberId: number) {
    return prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: {
        status: true,
        balanceDt: true,
        leftPoints: true,
        rightPoints: true,
        baselineLeft: true,
        baselineRight: true,
        carriedLeftPoints: true,
        carriedRightPoints: true,
        lifetimeBalanceCount: true,
        startupBonusUsed: true,
        rewardPoints: true,
        activatedDescendants: true,
      },
    });
  }

  async function eventsOf(memberId: number) {
    return prisma.commissionEvent.findMany({
      where: { memberId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Pack de test à plafond serré (le plafond Silver, 10000 DT, serait hors de portée d'un test). */
  async function createCapPack(weeklyCapDt: number): Promise<number> {
    const pack = await prisma.pack.create({
      data: {
        name: `TestCap-${Date.now()}-${periodSeq}-${seq}`,
        tierBv: 1000,
        priceDt: money(100),
        directCommissionDt: money(500),
        indirectCommissionDt: money(250),
        weeklyCapDt: money(weeklyCapDt),
      },
    });
    createdPacks.push(pack.id);
    return pack.id;
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
    const placement = new PlacementService(prisma);
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
    renewal = new RenewalService(prisma, fees, ecards);
    runs = new CommissionRunService(prisma, ledger);

    const silver = await prisma.pack.findFirstOrThrow({
      where: { name: 'Silver' },
    });
    silverId = silver.id;
    silverPrice = silver.priceDt;
    feeDt = await fees.read(REGISTRATION_FEE_SETTING);

    const admin = await prisma.adminUser.findFirstOrThrow();
    adminId = admin.id;

    // Voir « QUARANTAINE DES ÉVÉNEMENTS ÉTRANGERS » en tête de fichier.
    await releaseQuarantine();
    await quarantineForeignEvents();
  });

  /**
   * Écarte des périodes de test tout événement non réclamé qui n'appartient pas à ce fichier
   * — typiquement ceux du réseau d'amorçage, laissés par `seed.int-spec` (D-056).
   */
  async function quarantineForeignEvents(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "CommissionEvent"
          SET "occurredAt" = "occurredAt" - interval '${QUARANTINE_YEARS} years'
        WHERE "runId" IS NULL`,
    );
  }

  /** Remet en place ce que la quarantaine a décalé — y compris après une exécution interrompue. */
  async function releaseQuarantine(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "CommissionEvent"
          SET "occurredAt" = "occurredAt" + interval '${QUARANTINE_YEARS} years'
        WHERE "occurredAt" < TIMESTAMP '${QUARANTINE_THRESHOLD}'`,
    );
  }

  afterEach(async () => {
    const memberIds = [...createdMembers].reverse();
    const packIds = [...createdPacks];
    const runIds = [...createdRuns];
    const ecardIds = [...createdEcards];
    createdMembers.length = 0;
    createdPacks.length = 0;
    createdRuns.length = 0;
    createdEcards.length = 0;
    // E-cards des frais d'inscription (D-036) puis leurs paiements d'adhésion : à purger
    // avant les membres (FK Restrict).
    if (ecardIds.length > 0) {
      await prisma.ecard.deleteMany({ where: { id: { in: ecardIds } } });
    }
    if (memberIds.length > 0) {
      await prisma.membershipPayment.deleteMany({
        where: { memberId: { in: memberIds } },
      });
    }
    if (memberIds.length > 0) {
      await prisma.commissionEvent.deleteMany({
        where: {
          OR: [
            { memberId: { in: memberIds } },
            { sourceMemberId: { in: memberIds } },
          ],
        },
      });
      await prisma.ledgerEntry.deleteMany({
        where: { memberId: { in: memberIds } },
      });
      await prisma.commission.deleteMany({
        where: { memberId: { in: memberIds } },
      });
    }
    if (runIds.length > 0) {
      // Les événements d'autres suites éventuellement réclamés repassent à NULL (SetNull).
      await prisma.commissionRun.deleteMany({ where: { id: { in: runIds } } });
    }
    if (memberIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { target: { in: memberIds.map((id) => `Member:${id}`) } },
      });
      for (const id of memberIds) {
        await prisma.member.delete({ where: { id } });
      }
    }
    if (packIds.length > 0) {
      await prisma.pack.deleteMany({ where: { id: { in: packIds } } });
    }
  });

  afterAll(async () => {
    // La base rendue aux suites suivantes doit être celle qu'on a trouvée : les événements
    // d'amorçage retrouvent leur date réelle, et redeviennent réclamables par un vrai run.
    await releaseQuarantine();
    await prisma.$disconnect();
  });

  // ─────────────────────────── Temps 1 : équilibres ───────────────────────────

  it('équilibre simple : 1000 pts G + 1000 pts D (Silver) → un BALANCE de 250 DT, points consommés', async () => {
    const root = await createRoot();
    await fundAndActivate(root.id);
    await addActive(root.memberCode, Leg.LEFT);
    await addActive(root.memberCode, Leg.RIGHT);

    const rootState = await state(root.id);
    expect(rootState.carriedLeftPoints).toBe(0); // consommés par l'équilibre
    expect(rootState.carriedRightPoints).toBe(0);
    expect(rootState.leftPoints).toBe(1000); // le cumul à vie, lui, ne redescend jamais
    expect(rootState.rightPoints).toBe(1000);
    expect(rootState.lifetimeBalanceCount).toBe(1);

    const events = await eventsOf(root.id);
    const balances = events.filter((e) => e.type === CommissionEventType.BALANCE);
    expect(balances).toHaveLength(1);
    expect(balances[0].amountDt.toString()).toBe('250');
    expect(balances[0].balanceIndex).toBe(1);
    expect(balances[0].eligible).toBe(true);

    // Le run crédite : 2 directes (filleuls Silver, 500 chacune) + 1 équilibre (250).
    await runPeriod();
    expect((await state(root.id)).balanceDt.toString()).toBe('1250');
  });

  it('carry-over : 3000 pts G / 2000 pts D → 2 équilibres (500 DT), 1000 pts reportés à gauche', async () => {
    const root = await createRoot();
    await fundAndActivate(root.id);
    // Une paire d'abord : le jalon « 2 activés » (D-031) est réglé par un équilibre NATUREL
    // — la fenêtre du bonus se referme, le scénario reste un pur carry-over.
    const l1 = await addActive(root.memberCode, Leg.LEFT);
    const r1 = await addActive(root.memberCode, Leg.RIGHT); // équilibre n°1
    // Puis 2000 pts de plus à gauche (chaîne), 1000 de plus à droite.
    const l2 = await addActive(l1.memberCode, Leg.LEFT);
    await addActive(l2.memberCode, Leg.LEFT);
    await addActive(r1.memberCode, Leg.RIGHT); // équilibre n°2 — il reste 1000 à gauche

    const rootState = await state(root.id);
    expect(rootState.leftPoints).toBe(3000); // cumul à vie : 3000 G / 2000 D
    expect(rootState.rightPoints).toBe(2000);
    expect(rootState.carriedLeftPoints).toBe(1000); // reportés — jamais perdus (D-033)
    expect(rootState.carriedRightPoints).toBe(0);
    expect(rootState.lifetimeBalanceCount).toBe(2);
    expect(rootState.startupBonusUsed).toBe(false); // jalon passé en équilibre : bonus éteint

    const balances = (await eventsOf(root.id)).filter(
      (e) => e.type === CommissionEventType.BALANCE,
    );
    expect(balances.map((e) => e.balanceIndex)).toEqual([1, 2]);
    expect(
      balances.reduce((sum, e) => sum.plus(e.amountDt), money(0)).toString(),
    ).toBe('500');
  });

  // ─────────────────────────── Bonus de démarrage (D-031) ───────────────────────────

  it('bonus : 2 activés du MÊME côté → 250 DT, points consommés, drapeau à vie, compteur = 1 ; un 3e ne redéclenche rien', async () => {
    const root = await createRoot();
    await fundAndActivate(root.id);
    const l1 = await addActive(root.memberCode, Leg.LEFT);
    const l2 = await addActive(l1.memberCode, Leg.LEFT); // 2e activé, même jambe

    let rootState = await state(root.id);
    expect(rootState.startupBonusUsed).toBe(true);
    expect(rootState.lifetimeBalanceCount).toBe(1); // le bonus EST l'équilibre n°1
    expect(rootState.carriedLeftPoints).toBe(1000); // 2000 reçus − 1000 consommés par le bonus
    expect(rootState.carriedRightPoints).toBe(0);

    const bonuses = (await eventsOf(root.id)).filter(
      (e) => e.type === CommissionEventType.STARTUP_BONUS,
    );
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0].amountDt.toString()).toBe('250');
    expect(bonuses[0].balanceIndex).toBe(1);

    // Un 3e membre activé (toujours à gauche) ne redéclenche PAS le bonus (une fois à vie).
    await addActive(l2.memberCode, Leg.LEFT);
    rootState = await state(root.id);
    expect(rootState.lifetimeBalanceCount).toBe(1);
    expect(rootState.carriedLeftPoints).toBe(2000);
    expect(
      (await eventsOf(root.id)).filter(
        (e) => e.type === CommissionEventType.STARTUP_BONUS,
      ),
    ).toHaveLength(1);
  });

  it('le bonus compte comme équilibre n°1 : après le bonus, le 5e vrai équilibre est le 6e à vie → Point Fidélité', async () => {
    const root = await createRoot();
    await fundAndActivate(root.id);
    // Bonus d'abord : 2 activés à gauche → compteur = 1, reste 1000 pts en pool gauche.
    const l1 = await addActive(root.memberCode, Leg.LEFT);
    let leftTip = await addActive(l1.memberCode, Leg.LEFT);
    // Puis 5 vrais équilibres : la droite matche le carry gauche, puis les paires suivent.
    const r1 = await addActive(root.memberCode, Leg.RIGHT); // équilibre n°2
    let rightTip = r1;
    for (let balance = 3; balance <= 6; balance += 1) {
      leftTip = await addActive(leftTip.memberCode, Leg.LEFT);
      rightTip = await addActive(rightTip.memberCode, Leg.RIGHT); // équilibre n°`balance`
    }

    const rootState = await state(root.id);
    expect(rootState.lifetimeBalanceCount).toBe(6);
    const events = await eventsOf(root.id);
    const sixth = events.find((e) => e.balanceIndex === 6);
    expect(sixth?.type).toBe(CommissionEventType.REWARD_POINT);
    expect(sixth?.amountDt.toString()).toBe('0');
  });

  // ─────────────────────────── Règle du 6e (D-032) ───────────────────────────

  it('6e équilibre : 0 DT mais +1 Point Fidélité ; le 7e repaie ; le 12e redonne un point', async () => {
    const root = await createRoot();
    await fundAndActivate(root.id);
    // 12 équilibres naturels : d'abord une paire directe sous la racine, puis les chaînes
    // descendent — chaque paire (gauche, droite) complète exactement un équilibre.
    let leftTip = await addActive(root.memberCode, Leg.LEFT);
    let rightTip = await addActive(root.memberCode, Leg.RIGHT); // équilibre n°1
    for (let balance = 2; balance <= 12; balance += 1) {
      leftTip = await addActive(leftTip.memberCode, Leg.LEFT);
      rightTip = await addActive(rightTip.memberCode, Leg.RIGHT); // équilibre n°`balance`
    }

    const rootState = await state(root.id);
    expect(rootState.lifetimeBalanceCount).toBe(12);

    const events = await eventsOf(root.id);
    const byIndex = new Map(
      events
        .filter((e) => e.balanceIndex !== null)
        .map((e) => [e.balanceIndex, e]),
    );
    expect(byIndex.get(6)?.type).toBe(CommissionEventType.REWARD_POINT);
    expect(byIndex.get(6)?.amountDt.toString()).toBe('0');
    expect(byIndex.get(7)?.type).toBe(CommissionEventType.BALANCE); // le 7e repaie
    expect(byIndex.get(7)?.amountDt.toString()).toBe('250');
    expect(byIndex.get(12)?.type).toBe(CommissionEventType.REWARD_POINT);

    // Au run : 10 équilibres payés (250) + 2 directes (500, filleuls directs de la racine),
    // et 2 Points Fidélité crédités (les deux sous le plafond de 10000).
    await runPeriod();
    const settled = await state(root.id);
    expect(settled.balanceDt.toString()).toBe('3500');
    expect(settled.rewardPoints).toBe(2);
  });

  // ─────────────────────────── Plafond (D-033) ───────────────────────────

  it('plafond : payé jusqu’au plafond, excédent PERDU (non reporté) — les points, eux, sont consommés et le compteur avance', async () => {
    const capPackId = await createCapPack(600);
    const root = await createRoot();
    await fundAndActivate(root.id, capPackId);
    await addActive(root.memberCode, Leg.LEFT); // DIRECT 500 (Silver du filleul)
    await addActive(root.memberCode, Leg.RIGHT); // DIRECT 500 + BALANCE 250

    const result = await runPeriod();
    expect(result.status).toBe(RunStatus.SUCCESS);

    const commission = await prisma.commission.findFirstOrThrow({
      where: { memberId: root.id },
    });
    expect(commission.grossDt.toString()).toBe('1250');
    expect(commission.paidDt.toString()).toBe('600'); // le plafond, pas un millime de plus
    expect(commission.appliedCapDt.toString()).toBe('600');

    const rootState = await state(root.id);
    expect(rootState.balanceDt.toString()).toBe('600'); // l'excédent (650) est PERDU
    // … mais l'équilibre au-delà du plafond a bien consommé ses points et compté à vie :
    expect(rootState.carriedLeftPoints).toBe(0);
    expect(rootState.carriedRightPoints).toBe(0);
    expect(rootState.lifetimeBalanceCount).toBe(1);

    // Rien n'est reporté : un run suivant ne re-paie rien (les événements sont soldés).
    await runPeriod();
    expect((await state(root.id)).balanceDt.toString()).toBe('600');
    expect(
      await prisma.commission.count({ where: { memberId: root.id } }),
    ).toBe(1);
  });

  it('chronologie (D-033) : l’ordre suit occurredAt, et sur une même activation la DIRECTE passe avant l’équilibre', async () => {
    const capPackId = await createCapPack(700);
    const root = await createRoot();
    await fundAndActivate(root.id, capPackId);
    await addActive(root.memberCode, Leg.LEFT); // t1 : DIRECT 500 → passe entière
    await addActive(root.memberCode, Leg.RIGHT); // t2 : DIRECT 500 (partielle) PUIS BALANCE 250 (perdue)

    await runPeriod();

    const events = await eventsOf(root.id);
    expect(events.map((e) => e.type)).toEqual([
      CommissionEventType.DIRECT,
      CommissionEventType.DIRECT,
      CommissionEventType.BALANCE,
    ]);
    // Si l'équilibre était passé avant la 2e directe, c'est LUI qui aurait pris les 200 DT
    // restants : les drapeaux `paid` prouvent l'ordre d'attribution.
    expect(events[0].paid).toBe(true);
    expect(events[1].paid).toBe(true); // payée partiellement (200 sur 500)
    expect(events[2].paid).toBe(false); // au-delà du plafond : perdue

    const rootState = await state(root.id);
    expect(rootState.balanceDt.toString()).toBe('700');
    expect(rootState.lifetimeBalanceCount).toBe(1); // l'équilibre perdu a quand même compté
  });

  // ─────────────────────────── Gel / réactivation (D-034) ───────────────────────────

  it('membre gelé : aucune commission (directe ou indirecte), mais les points TRAVERSENT vers les uplines actifs', async () => {
    const grand = await createRoot();
    await fundAndActivate(grand.id);
    const frozen = await addActive(grand.memberCode, Leg.LEFT);
    await renewal.freeze(frozen.id);

    // Un filleul du gelé s'active sous lui : la DIRECTE naît inéligible, sa pool ne bouge
    // pas — et le grand-parent ACTIF, lui, est bien crédité (les points traversent).
    await addActive(frozen.memberCode, Leg.LEFT);

    const frozenState = await state(frozen.id);
    expect(frozenState.status).toBe(MemberStatus.INACTIVE);
    expect(frozenState.leftPoints).toBe(1000); // le cumul à vie monte (audit)
    expect(frozenState.carriedLeftPoints).toBe(0); // la pool, JAMAIS pendant le gel

    const direct = (await eventsOf(frozen.id)).find(
      (e) => e.type === CommissionEventType.DIRECT,
    );
    expect(direct?.eligible).toBe(false);

    const grandState = await state(grand.id);
    expect(grandState.leftPoints).toBe(2000); // traversée prouvée : 1000 (gelé) + 1000 (à travers lui)
    // Au passage du 2e activé de son sous-arbre, le grand-parent ACTIF a touché son bonus
    // de démarrage (D-031) : 2000 pts en pool − 1000 consommés par le bonus.
    expect(grandState.carriedLeftPoints).toBe(1000);
    expect(grandState.startupBonusUsed).toBe(true);

    // Le run solde l'événement inéligible sans jamais le payer.
    await runPeriod();
    expect((await state(frozen.id)).balanceDt.toString()).toBe('0');
    expect(
      await prisma.commission.count({ where: { memberId: frozen.id } }),
    ).toBe(0);
    const settledDirect = await prisma.commissionEvent.findUniqueOrThrow({
      where: { id: direct!.id },
    });
    expect(settledDirect.runId).not.toBeNull(); // soldé (tracé)…
    expect(settledDirect.paid).toBe(false); // …jamais payé
  });

  it('réactivation : nouvelle baseline (les points du gel ne rapportent jamais), carry-over d’avant gel CONSERVÉ', async () => {
    const grand = await createRoot();
    await fundAndActivate(grand.id);
    const member = await addActive(grand.memberCode, Leg.LEFT);

    // AVANT gel : 1000 pts en pool gauche (carry-over acquis).
    const c1 = await addActive(member.memberCode, Leg.LEFT);
    expect((await state(member.id)).carriedLeftPoints).toBe(1000);

    await renewal.freeze(member.id);
    // PENDANT le gel : 1000 pts de plus traversent (jamais dans la pool).
    await addActive(c1.memberCode, Leg.LEFT);
    await renewal.reactivate(member.id);

    const reactivated = await state(member.id);
    expect(reactivated.status).toBe(MemberStatus.ACTIVE);
    expect(reactivated.baselineLeft).toBe(2000); // nouvelle baseline figée (audit)
    expect(reactivated.carriedLeftPoints).toBe(1000); // le carry-over d'avant gel, intact

    // APRÈS réactivation : 1000 pts à droite → équilibre avec le carry d'AVANT gel
    // uniquement (les 1000 du gel n'existent pas pour le moteur).
    await addActive(member.memberCode, Leg.RIGHT);
    const after = await state(member.id);
    expect(after.lifetimeBalanceCount).toBe(1);
    expect(after.carriedLeftPoints).toBe(0);
    expect(after.carriedRightPoints).toBe(0);
    const balances = (await eventsOf(member.id)).filter(
      (e) => e.type === CommissionEventType.BALANCE,
    );
    expect(balances).toHaveLength(1);
    expect(balances[0].eligible).toBe(true);
  });

  it('membre INSCRIT : ignoré par le run — sa DIRECTE naît inéligible et n’est jamais payée (§10)', async () => {
    const root = await createRoot();
    await fundAndActivate(root.id);
    // `sponsor` reste INSCRIT ; son filleul s'active sous lui.
    const sponsor = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await addActive(sponsor.memberCode, Leg.LEFT);

    const direct = (await eventsOf(sponsor.id)).find(
      (e) => e.type === CommissionEventType.DIRECT,
    );
    expect(direct?.eligible).toBe(false);

    await runPeriod();
    expect((await state(sponsor.id)).balanceDt.toString()).toBe('0');
    expect(
      await prisma.commission.count({ where: { memberId: sponsor.id } }),
    ).toBe(0);
  });

  // ─────────────────────────── Snapshot, idempotence, atomicité ───────────────────────────

  it('snapshot : modifier le pack APRÈS les événements ne change ni les montants ni le plafond appliqués', async () => {
    const capPackId = await createCapPack(600);
    const root = await createRoot();
    await fundAndActivate(root.id, capPackId);
    await addActive(root.memberCode, Leg.LEFT);
    await addActive(root.memberCode, Leg.RIGHT); // gross 1250, plafond 600

    // La cliente « améliore » le pack après coup : rien de rétroactif ne doit bouger.
    await prisma.pack.update({
      where: { id: capPackId },
      data: { indirectCommissionDt: money(9999), weeklyCapDt: money(99999) },
    });

    await runPeriod();
    const commission = await prisma.commission.findFirstOrThrow({
      where: { memberId: root.id },
    });
    expect(commission.grossDt.toString()).toBe('1250'); // montants figés à l'événement
    expect(commission.appliedCapDt.toString()).toBe('600'); // plafond figé au snapshot d'activation
    expect((await state(root.id)).balanceDt.toString()).toBe('600');
  });

  it('idempotence : relancer un run (même période, ou période recouvrante) ne double JAMAIS les crédits', async () => {
    const root = await createRoot();
    await fundAndActivate(root.id);
    await addActive(root.memberCode, Leg.LEFT);
    await addActive(root.memberCode, Leg.RIGHT);

    const period = nextPeriod();
    const first = await runs.runForPeriod(period);
    createdRuns.push(first.runId);
    const balanceAfterFirst = (await state(root.id)).balanceDt.toString();
    expect(balanceAfterFirst).toBe('1250');

    // Même période : no-op (run SUCCESS déjà là).
    const second = await runs.runForPeriod(period);
    expect(second.alreadyExecuted).toBe(true);
    expect(second.runId).toBe(first.runId);
    expect((await state(root.id)).balanceDt.toString()).toBe(balanceAfterFirst);

    // Période RECOUVRANTE (autres bornes) : la réclamation ne retrouve pas les événements
    // déjà soldés — zéro re-crédit, une seule ligne de règlement.
    const third = await runPeriod();
    expect(third.alreadyExecuted).toBe(false);
    expect((await state(root.id)).balanceDt.toString()).toBe(balanceAfterFirst);
    expect(
      await prisma.commission.count({ where: { memberId: root.id } }),
    ).toBe(1);
  });

  it('atomicité (D-027) : une activation interrompue APRÈS le temps 1 ne laisse ni événement, ni point, ni consommation', async () => {
    const root = await createRoot();
    await fundAndActivate(root.id);
    const child = await register(root.memberCode, root.memberCode, Leg.LEFT);
    await ledger.recordMovement({
      memberId: child.id,
      type: 'ADMIN_GENESIS',
      amountDt: silverPrice,
      reason: 'Test rollback',
    });
    const before = await state(root.id);

    // Composition réelle (checkout, D-027) : l'activation réussit ENTIÈREMENT dans la
    // transaction — événements de commission compris — puis l'appelant échoue. Postgres
    // doit tout reprendre : aucune compensation applicative.
    await expect(
      prisma.$transaction(
        async (tx) => {
          await activation.activateInTx(tx, {
            memberId: child.id,
            packId: silverId,
          });
          throw new Error('échec simulé après le temps 1');
        },
        { timeout: 15_000 },
      ),
    ).rejects.toThrow('échec simulé après le temps 1');

    expect(
      await prisma.commissionEvent.count({
        where: { sourceMemberId: child.id },
      }),
    ).toBe(0); // aucun événement orphelin
    const after = await state(root.id);
    expect(after).toEqual(before); // pools, compteurs, points : rien n'a bougé
    expect((await state(child.id)).status).toBe(MemberStatus.REGISTERED);
  });
});
