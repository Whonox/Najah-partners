import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemberStatus, Pack, ProductType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Money, money } from '../common/money';
import { EcardsService } from '../ecards/ecards.service';
import { LedgerAdminService } from '../ledger/ledger-admin.service';
import { ActivationService } from '../members/activation.service';
import {
  MemberCodeService,
  SEED_LAST_MEMBER_NUMBER,
} from '../members/member-code.service';
import {
  MembershipFeeService,
  REGISTRATION_FEE_SETTING,
} from '../members/membership-fee.service';
import { MembersService } from '../members/members.service';
import {
  normalizeSecurityAnswer,
  type SecurityQuestionKey,
} from '../members/onboarding/security-questions';
import { RenewalService } from '../members/renewal.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildNetworkPlan, PlannedMember, summarizePlan } from './network-plan';

const ROOT_CODE = 'NP000963';
const SEED_PASSWORD = 'ChangeMe123!';
const ADMIN_EMAIL = 'admin@najah.local';

/**
 * Parcours de première connexion des comptes d'amorçage (D-050, T9.5).
 *
 * ═══ POURQUOI LE SEED DOIT S'EN OCCUPER ═══
 * Le parcours est BLOQUANT (D-057) : sans cette étape, les 500 comptes d'amorçage seraient
 * tous enfermés dehors et aucun écran du portail ne serait consultable — le réseau de
 * développement redeviendrait muet, comme il l'était avant D-056.
 *
 * ═══ CE QUE LE SEED NE SIMULE PAS ═══
 * L'IMAGE de la pièce d'identité. Ces comptes n'en ont jamais eu (le seed n'a jamais fourni de
 * fichier), et inventer un chemin donnerait une image illisible à la file de vérification de
 * l'admin. Le parcours est donc marqué terminé SANS passer par `OnboardingService` : ce sont
 * des comptes de développement antérieurs au parcours, pas des membres qui l'ont suivi.
 *
 * ═══ LES DERNIERS COMPTES RESTENT NON ACCUEILLIS ═══
 * `SEED_NOT_ONBOARDED_TAIL` comptes sont laissés intacts pour que le parcours réel soit
 * TESTABLE sans créer un membre à la main à chaque fois. Un seed qui n'expose que l'état final
 * ne permet pas de vérifier le chemin qui y mène.
 */
const SEED_PIN = '4827';
const SEED_NOT_ONBOARDED_TAIL = 5;
const SEED_SECURITY_ANSWERS: ReadonlyArray<{
  questionKey: SecurityQuestionKey;
  answer: string;
}> = [
  { questionKey: 'FIRST_SCHOOL', answer: 'Ibn Khaldoun' },
  { questionKey: 'CHILDHOOD_NICKNAME', answer: 'Momo' },
  { questionKey: 'FIRST_PET_NAME', answer: 'Bella' },
];

/** Cadence du journal de progression : un seed de 500 comptes dure des minutes, pas des ms. */
const PROGRESS_STEP = 50;

@Injectable()
export class SeedService {
  private readonly logger = new Logger('Seed');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly members: MembersService,
    private readonly activation: ActivationService,
    private readonly ledgerAdmin: LedgerAdminService,
    private readonly memberCode: MemberCodeService,
    private readonly fees: MembershipFeeService,
    private readonly ecards: EcardsService,
    // Le gel des comptes non renouvelés (D-034) passe par le service, jamais par un UPDATE :
    // lui seul verrouille la ligne et refuse une transition depuis un statut inattendu.
    private readonly renewal: RenewalService,
  ) {}

  async run(): Promise<void> {
    await this.referenceData();
    await this.catalog();
    await this.bootstrapNetwork();
    await this.alignMemberCodeSequence();
  }

  /**
   * Catalogue d'amorçage (spec §5.7). Les valeurs en POINTS sont choisies pour se COMBINER
   * exactement vers chaque palier (D-006) — sans quoi aucun panier d'activation ne serait
   * composable : 250 / 500 / 1000 / 2000 couvrent 1000, 2000, 3000 et 4000.
   *
   * Les PRIX (DT) n'ont, eux, aucun rapport avec les points : un panier Silver de 1000 points
   * peut coûter 380 DT de produits, l'activation n'en fera pas moins payer les 2200 DT du pack
   * (D-029). C'est le modèle à deux dimensions, et c'est voulu.
   *
   * On y trouve les cas qui comptent : un VIRTUEL (stock illimité, `null`), un physique en
   * promotion (le prix baisse, les points ne bougent pas — D-002), et des frais de livraison
   * (affichés, réglés hors système, jamais dans un montant dû).
   */
  private async catalog(): Promise<void> {
    const categories = [
      {
        name: 'Huiles d’olive',
        description: 'Huiles extra-vierges pressées à froid.',
        sortOrder: 1,
      },
      {
        name: 'Produits naturels',
        description: 'Savons, miels et dérivés de l’olive.',
        sortOrder: 2,
      },
      {
        name: 'Contenus numériques',
        description: 'Guides et formations (livraison immédiate).',
        sortOrder: 3,
      },
    ];
    const ids = new Map<string, number>();
    for (const category of categories) {
      const row = await this.prisma.category.upsert({
        where: { name: category.name },
        update: category,
        create: category,
      });
      ids.set(category.name, row.id);
    }

    const products: Array<{
      name: string;
      category: string;
      priceDt: number;
      valueBv: number;
      type: ProductType;
      stock: number | null;
      shippingFeeDt?: number;
      promoPriceDt?: number;
    }> = [
      {
        name: 'Huile d’olive extra-vierge 1 L',
        category: 'Huiles d’olive',
        priceDt: 45,
        valueBv: 250,
        type: ProductType.PHYSICAL,
        stock: 500,
        shippingFeeDt: 7,
      },
      {
        name: 'Huile d’olive extra-vierge 5 L',
        category: 'Huiles d’olive',
        priceDt: 190,
        valueBv: 500,
        type: ProductType.PHYSICAL,
        stock: 200,
        shippingFeeDt: 10,
        promoPriceDt: 169,
      },
      {
        name: 'Coffret olive — sélection',
        category: 'Huiles d’olive',
        priceDt: 380,
        valueBv: 1000,
        type: ProductType.PHYSICAL,
        stock: 100,
        shippingFeeDt: 12,
      },
      {
        name: 'Coffret prestige Najah',
        category: 'Huiles d’olive',
        priceDt: 740,
        valueBv: 2000,
        type: ProductType.PHYSICAL,
        stock: 50,
        shippingFeeDt: 15,
      },
      {
        name: 'Savon d’Alep à l’huile d’olive',
        category: 'Produits naturels',
        priceDt: 42,
        valueBv: 250,
        type: ProductType.PHYSICAL,
        stock: 300,
        shippingFeeDt: 5,
      },
      {
        name: 'Miel de romarin 500 g',
        category: 'Produits naturels',
        priceDt: 88,
        valueBv: 500,
        type: ProductType.PHYSICAL,
        stock: 150,
        shippingFeeDt: 6,
      },
      {
        name: 'Guide numérique — nutrition à l’olive',
        category: 'Contenus numériques',
        priceDt: 40,
        valueBv: 250,
        type: ProductType.VIRTUAL,
        stock: null,
      },
    ];

    for (const product of products) {
      const data = {
        name: product.name,
        categoryId: ids.get(product.category)!,
        priceDt: money(product.priceDt),
        valueBv: product.valueBv,
        type: product.type,
        stock: product.stock,
        shippingFeeDt: money(product.shippingFeeDt ?? 0),
        promoPriceDt:
          product.promoPriceDt === undefined
            ? null
            : money(product.promoPriceDt),
      };
      // `Product.name` n'est pas unique en base (deux produits peuvent porter le même nom) :
      // pas d'upsert possible, on cherche puis on écrit — le seed reste idempotent.
      const existing = await this.prisma.product.findFirst({
        where: { name: product.name },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.product.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.product.create({ data });
      }
    }

    this.logger.log(
      `Catalogue : ${categories.length} catégories, ${products.length} produits ` +
        '(points 250/500/1000/2000 → paliers 1000/2000/3000/4000).',
    );
  }

  /**
   * Packs, paramètres système, admin initial — idempotents par upsert.
   *
   * Table du plan de rémunération, telle que la cliente l'a arrêtée (D-028, D-029). Les deux
   * dimensions y coexistent sans se convertir :
   *   POINTS  → `tierBv` : ce que le panier doit composer, ce que l'arbre reçoit ;
   *   DINARS  → `priceDt` (le prix payé à l'activation) et le plan de rémunération
   *             (commission directe, indirecte par cycle, plafond hebdomadaire).
   * Un Silver, c'est 1000 points d'arbre pour 2200 DT — et ces deux nombres n'ont aucun rapport
   * arithmétique entre eux. Chercher un « taux » ici serait un contresens.
   */
  private async referenceData(): Promise<void> {
    const packs = [
      {
        name: 'Silver',
        tierBv: 1000, // points
        priceDt: money(2200), // dinars
        directCommissionDt: money(500),
        indirectCommissionDt: money(250),
        weeklyCapDt: money(10000),
      },
      {
        name: 'Gold',
        tierBv: 2000,
        priceDt: money(3350),
        directCommissionDt: money(700),
        indirectCommissionDt: money(400),
        weeklyCapDt: money(16000),
      },
      {
        name: 'Safari',
        tierBv: 3000,
        priceDt: money(5400),
        directCommissionDt: money(900),
        indirectCommissionDt: money(600),
        weeklyCapDt: money(24000),
      },
      {
        name: 'Diamond',
        tierBv: 4000,
        priceDt: money(8350),
        directCommissionDt: money(1200),
        indirectCommissionDt: money(900),
        weeklyCapDt: money(36000),
      },
    ];
    for (const pack of packs) {
      await this.prisma.pack.upsert({
        where: { name: pack.name },
        update: pack,
        create: pack,
      });
    }

    const settings = [
      {
        key: 'ecard_expiration_days',
        value: '180',
        description:
          'Durée de validité d’une e-card, en jours, à compter de son émission. -1 = sans expiration. À l’échéance, la valeur est recréditée au solde de son créateur.',
      },
      {
        key: 'registration_fee_dt',
        value: '100',
        description:
          'Frais d’inscription en dinars, réglés par e-card(s) au moment de l’inscription. Ils valent acompte : leur montant est déduit du prix du pack lors de l’activation.',
      },
      {
        key: 'annual_renewal_dt',
        value: '100',
        description:
          'Montant en dinars du renouvellement annuel d’adhésion. Le membre le règle par e-card(s) ; un administrateur valide ensuite le paiement pour que l’adhésion reprenne effet.',
      },
      {
        key: 'commission_cron_day',
        value: 'FRIDAY',
        description:
          'Jour de la semaine où les commissions sont arrêtées et versées.',
      },
      {
        key: 'commission_cron_time',
        value: '23:59',
        description:
          'Heure de clôture des commissions, dans le fuseau horaire ci-dessous.',
      },
      {
        key: 'commission_timezone',
        value: 'Africa/Tunis',
        description:
          'Fuseau horaire de référence pour la clôture des commissions.',
      },
      {
        key: 'member_code_prefix',
        value: 'NP',
        description:
          'Lettres placées devant le numéro de chaque nouveau membre pour former son code (ex. NP000042).',
      },
      {
        key: 'currency',
        value: 'DT',
        description:
          'Devise de tous les montants : le dinar tunisien, affiché à 3 décimales (le millime). Les points ne sont pas une devise et ne s’y convertissent pas.',
      },
    ];
    for (const setting of settings) {
      await this.prisma.setting.upsert({
        where: { key: setting.key },
        update: setting,
        create: setting,
      });
    }

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, this.bcryptRounds());
    await this.prisma.adminUser.upsert({
      where: { email: ADMIN_EMAIL },
      update: {},
      create: {
        name: 'Super Admin',
        email: ADMIN_EMAIL,
        passwordHash,
        role: 'SUPER_ADMIN',
      },
    });

    this.logger.log(
      `Référentiel : ${packs.length} packs, ${settings.length} paramètres, 1 admin (${ADMIN_EMAIL}).`,
    );
  }

  /**
   * Le réseau d'amorçage — 500 comptes dans UN SEUL arbre (révise D-019), créés PAR LES VRAIS
   * SERVICES (inscription puis activation) : dupliquer ici la propagation de points produirait
   * un arbre incohérent avec le code qu'il est censé amorcer.
   *
   * La topologie vient de `network-plan.ts` (module pur, déterministe). Ce service ne décide
   * plus RIEN de la forme du réseau : il exécute un plan dont les invariants (racine unique,
   * ordre top-down, D-022) sont testés à part.
   *
   * TROIS TEMPS, dans cet ordre — et l'ordre est le fond, pas la forme :
   *  1. INSCRIPTIONS top-down. Un upline doit préexister à son filleul ; le plan garantit
   *     `uplineIndex < index`, donc dérouler le tableau suffit.
   *  2. ACTIVATIONS racine → feuilles. Chaque ancêtre est déjà ACTIF quand ses downlines
   *     s'activent : sa pool appariable EST créditée (D-035), les équilibres se complètent,
   *     les commissions DIRECTES naissent éligibles. C'est l'inverse de l'ancien seed (feuilles
   *     → racine), qui produisait un réseau financièrement muet — aucun écran n'avait de
   *     chiffres à montrer. Contrepartie assumée : le premier run hebdomadaire versera de
   *     l'argent, ce qui est précisément ce qu'on veut voir fonctionner.
   *  3. GEL des comptes prévus INACTIFS (D-034), APRÈS activation — un gelé est par définition
   *     un membre qui a été actif puis n'a pas renouvelé. Le gel passe par `RenewalService`,
   *     jamais par un UPDATE direct : lui seul sérialise la transition avec les activations
   *     qui traversent le membre.
   */
  private async bootstrapNetwork(): Promise<void> {
    const root = await this.prisma.member.findUnique({
      where: { memberCode: ROOT_CODE },
      select: { id: true },
    });
    if (root) {
      this.logger.log(
        `Réseau d’amorçage déjà en place (${ROOT_CODE}) — rien à faire.`,
      );
      return;
    }

    // Rembobiner la séquence n'est SÛR que si aucun code canonique n'a encore été distribué.
    const existing = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "Member" WHERE "memberCode" ~ '^NP[0-9]+$'
    `;
    if (existing[0].count > 0) {
      throw new Error(
        `Base déjà peuplée (${existing[0].count} membre(s)) sans le compte racine ${ROOT_CODE} : ` +
          'amorçage refusé pour ne pas rembobiner la séquence des codes membres.',
      );
    }

    const plan = buildNetworkPlan();
    const stats = summarizePlan(plan);
    const startedAt = Date.now();
    await this.prisma
      .$executeRaw`SELECT setval('member_code_seq', ${SEED_LAST_MEMBER_NUMBER - plan.length}::bigint, true)`;

    const packs = new Map(
      (await this.prisma.pack.findMany()).map((pack) => [pack.name, pack]),
    );
    const adminId = await this.adminId();
    // Le tarif est lu UNE fois : 500 lectures du même paramètre pour un résultat identique.
    // Le hachage du mot de passe, lui, reste dans `MembersService.register` — le seed n'a pas
    // à contourner le vrai chemin d'inscription pour gagner quelques secondes.
    const feeDt = await this.fees.read(REGISTRATION_FEE_SETTING);

    // ── 1. Inscriptions, top-down ──
    const ids: number[] = [];
    const codes: string[] = [];
    for (const node of plan) {
      const expected = this.seedMemberCode(node.index, plan.length);
      const created =
        node.uplineIndex === null
          ? await this.createRootMember(node)
          : await this.registerSeedMember(node, {
              uplineCode: codes[node.uplineIndex],
              sponsorCode: codes[node.sponsorIndex!],
              adminId,
              feeDt,
            });
      this.assertCode(created.memberCode, expected);
      ids[node.index] = created.id;
      codes[node.index] = created.memberCode;
      this.progress('Inscriptions', node.index + 1, plan.length);
    }

    // ── 2. Activations, racine → feuilles ──
    // On dote chaque compte du MONTANT DÛ en dinars — prix du pack moins l'acompte déjà versé
    // à l'inscription (D-029 + D-037) —, puis on active : la stratégie de paiement par solde
    // débite exactement ce montant et le solde retombe à zéro. L'arbre, lui, reçoit le palier
    // en POINTS : les deux dimensions se croisent dans l'activation sans jamais se convertir
    // (D-028). La racine n'est pas passée par l'inscription : son acompte vaut 0, elle paie
    // donc le prix plein — et c'est exact, elle n'a rien versé.
    const toActivate = plan.filter(
      (node) => node.status !== MemberStatus.REGISTERED,
    );
    for (const [rank, node] of toActivate.entries()) {
      const pack = packs.get(node.packName!);
      if (!pack) {
        throw new Error(
          `Pack inconnu dans le plan d’amorçage : ${node.packName}.`,
        );
      }
      await this.activateSeedMember(
        ids[node.index],
        pack,
        adminId,
        codes[node.index],
      );
      this.progress('Activations', rank + 1, toActivate.length);
    }

    // ── 3. Gel des comptes non renouvelés (D-034) ──
    const toFreeze = plan.filter(
      (node) => node.status === MemberStatus.INACTIVE,
    );
    for (const node of toFreeze) {
      await this.renewal.freeze(ids[node.index]);
    }

    // ── 4. Parcours de première connexion (D-050) ──
    const onboarded = await this.completeSeedOnboarding(ids);

    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const packMix = Object.entries(stats.packs)
      .map(([name, count]) => `${name} ${count}`)
      .join(', ');
    this.logger.log(
      `Réseau d’amorçage créé en ${seconds} s : ${stats.total} comptes ` +
        `(${ROOT_CODE} → ${codes[plan.length - 1]}), UN seul arbre, profondeur max ${stats.maxDepth}.`,
    );
    this.logger.log(
      `Statuts : ${stats.active} ACTIFS, ${stats.registered} INSCRITS, ${stats.inactive} INACTIFS ` +
        `(gelés). Packs des activés : ${packMix}.`,
    );
    this.logger.log(
      `Connexion affilié : code ${ROOT_CODE} (ou ${plan[0].email}), mot de passe ${SEED_PASSWORD}.`,
    );
    this.logger.log(
      `Première connexion (D-050) : ${onboarded} comptes accueillis, PIN ${SEED_PIN}, ` +
        `réponses secrètes « ${SEED_SECURITY_ANSWERS.map((a) => a.answer).join(' / ')} ». ` +
        `Les ${SEED_NOT_ONBOARDED_TAIL} derniers comptes (${codes[plan.length - SEED_NOT_ONBOARDED_TAIL]} → ` +
        `${codes[plan.length - 1]}) sont laissés NON accueillis pour tester le parcours.`,
    );
  }

  /**
   * Marque le parcours d'accueil comme terminé pour les comptes d'amorçage — sauf les
   * derniers, laissés intacts pour que le parcours réel reste testable.
   *
   * ═══ POURQUOI UN SEUL HACHAGE POUR TOUS ═══
   * Le PIN et les trois réponses sont hachés UNE fois et le même hash est réutilisé pour les
   * ~495 comptes. C'est inacceptable en production — deux membres au même PIN auraient le même
   * hash, ce que le sel de bcrypt existe précisément pour empêcher — et sans conséquence ici :
   * ce sont des comptes de développement au secret PUBLIC (il est écrit dans le journal
   * ci-dessus). Hacher 495 × 4 fois coûterait plusieurs minutes pour protéger un secret que
   * l'on imprime à l'écran. Le vrai chemin, lui, hache par membre (`OnboardingService`).
   */
  private async completeSeedOnboarding(ids: number[]): Promise<number> {
    const targets = ids.slice(
      0,
      Math.max(0, ids.length - SEED_NOT_ONBOARDED_TAIL),
    );
    if (targets.length === 0) return 0;

    const rounds = this.bcryptRounds();
    const pinHash = await bcrypt.hash(SEED_PIN, rounds);
    const answerHashes = await Promise.all(
      SEED_SECURITY_ANSWERS.map(async (a) => ({
        questionKey: a.questionKey,
        // MÊME normalisation que le service : sinon aucune réponse saisie au portail ne
        // correspondrait à ce que le seed a écrit, et la seconde auth serait intestable.
        answerHash: await bcrypt.hash(
          normalizeSecurityAnswer(a.answer),
          rounds,
        ),
      })),
    );

    await this.prisma.member.updateMany({
      where: { id: { in: targets } },
      data: { pinHash, onboardingCompletedAt: new Date() },
    });
    await this.prisma.memberSecurityAnswer.createMany({
      data: targets.flatMap((memberId) =>
        answerHashes.map((h) => ({ memberId, ...h })),
      ),
      skipDuplicates: true, // relance du seed sur une base déjà amorcée
    });

    return targets.length;
  }

  /**
   * Dote le membre du montant dû puis active. Deux opérations, une seule intention — mais
   * volontairement PAS une seule transaction : `activate` ouvre la sienne et verrouille toute
   * la chaîne d'ancêtres (D-024). Les emboîter ferait tenir un verrou de genèse pendant la
   * remontée d'arbre, pour rien.
   */
  private async activateSeedMember(
    memberId: number,
    pack: Pack,
    adminId: number,
    memberCode: string,
  ): Promise<void> {
    const member = await this.prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      select: { registrationPaidDt: true },
    });
    await this.ledgerAdmin.genesis({
      adminId,
      memberId,
      amountDt: pack.priceDt.minus(member.registrationPaidDt),
      reason: `Amorçage du réseau (D-019) — ${memberCode}`,
    });
    await this.activation.activate({ memberId, packId: pack.id });
  }

  /** Code attendu pour le nᵉ compte d'amorçage — le premier est toujours `ROOT_CODE`. */
  private seedMemberCode(index: number, size: number): string {
    const first = SEED_LAST_MEMBER_NUMBER - size + 1;
    return `NP${String(first + index).padStart(6, '0')}`;
  }

  private progress(label: string, done: number, total: number): void {
    if (done % PROGRESS_STEP === 0 || done === total) {
      this.logger.log(`${label} : ${done}/${total}`);
    }
  }

  /** La racine n'a ni sponsor ni upline : elle ne peut pas passer par l'inscription normale. */
  private async createRootMember(
    node: PlannedMember,
  ): Promise<{ id: number; memberCode: string }> {
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, this.bcryptRounds());
    return this.prisma.$transaction(async (tx) => {
      const memberCode = await this.memberCode.allocate(tx);
      return tx.member.create({
        data: {
          memberCode,
          lastName: node.lastName,
          firstName: node.firstName,
          email: node.email,
          passwordHash,
          status: MemberStatus.REGISTERED,
        },
        select: { id: true, memberCode: true },
      });
    });
  }

  /**
   * L'inscription se règle par e-card depuis D-036 : on génère pour chaque compte d'amorçage
   * une e-card de GENÈSE du montant exact des frais. C'est cohérent avec l'esprit du seed —
   * l'amorçage crée la valeur ex nihilo (D-017b), il ne la fait pas surgir dans un solde — et
   * cela fait passer les comptes de seed par le VRAI chemin d'inscription, contrôles compris.
   *
   * Sponsor et upline de placement sont DISTINCTS dans le plan (le sponsor est un ancêtre de
   * la position, D-022) : le réseau amorcé exerce donc le cas réel où la commission directe
   * remonte ailleurs que le binaire, et pas seulement le cas dégénéré sponsor = upline.
   */
  private async registerSeedMember(
    node: PlannedMember,
    context: {
      uplineCode: string;
      sponsorCode: string;
      adminId: number;
      feeDt: Money;
    },
  ): Promise<{ id: number; memberCode: string }> {
    const ecard = await this.ecards.genesis({
      adminId: context.adminId,
      valueDt: context.feeDt,
      reason: `Amorçage du réseau (D-019) — frais d’inscription ${node.email}`,
    });

    const member = await this.members.register({
      lastName: node.lastName,
      firstName: node.firstName,
      email: node.email,
      password: SEED_PASSWORD,
      sponsorCode: context.sponsorCode,
      uplineCode: context.uplineCode,
      leg: node.leg!,
      ecardCodes: [ecard.code],
    });
    return { id: member.id, memberCode: member.memberCode };
  }

  /**
   * Cale le compteur après le dernier code d'amorçage — sans JAMAIS le rembobiner : on prend
   * le maximum entre le plancher D-019, le plus grand code réellement distribué et la position
   * courante. Le filtre `^NP[0-9]+$` exclut les codes des fixtures de test (`NP-IT-…`), qui
   * feraient exploser le cast.
   */
  private async alignMemberCodeSequence(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ lastUsed: number }>>`
      SELECT setval('member_code_seq', GREATEST(
        (SELECT COALESCE(MAX(substring("memberCode" FROM 3)::bigint), 0)
           FROM "Member" WHERE "memberCode" ~ '^NP[0-9]{1,15}$'),
        ${SEED_LAST_MEMBER_NUMBER}::bigint,
        (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM member_code_seq)
      ), true)::int AS "lastUsed"
    `;
    this.logger.log(
      `Séquence des codes membres calée : prochain code = NP${String(rows[0].lastUsed + 1).padStart(6, '0')}.`,
    );
  }

  private async adminId(): Promise<number> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { email: ADMIN_EMAIL },
      select: { id: true },
    });
    return admin.id;
  }

  private assertCode(actual: string, expected: string): void {
    if (actual !== expected) {
      throw new Error(
        `Séquence des codes membres désalignée : attendu ${expected}, obtenu ${actual}.`,
      );
    }
  }

  private bcryptRounds(): number {
    return Number(this.config.get<string>('BCRYPT_ROUNDS', '10'));
  }
}
