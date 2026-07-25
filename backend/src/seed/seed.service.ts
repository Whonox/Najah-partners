import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Leg, MemberStatus, ProductType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { money } from '../common/money';
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
import { PrismaService } from '../prisma/prisma.service';

const ROOT_CODE = 'NP000963';
const SEED_PASSWORD = 'ChangeMe123!';
const SEED_PACK = 'Silver';
const ADMIN_EMAIL = 'admin@najah.local';

/**
 * Réseau d'amorçage (D-019) : 3 niveaux, 7 comptes ACTIFS. Inscription TOP-DOWN (un upline
 * doit préexister), ce qui fige aussi les codes NP000963..NP000969 dans l'ordre.
 */
const NETWORK: Array<{
  code: string;
  firstName: string;
  upline: string | null;
  leg: Leg | null;
}> = [
  { code: 'NP000963', firstName: 'Racine', upline: null, leg: null },
  { code: 'NP000964', firstName: 'Niveau2G', upline: ROOT_CODE, leg: Leg.LEFT },
  {
    code: 'NP000965',
    firstName: 'Niveau2D',
    upline: ROOT_CODE,
    leg: Leg.RIGHT,
  },
  {
    code: 'NP000966',
    firstName: 'Niveau3GG',
    upline: 'NP000964',
    leg: Leg.LEFT,
  },
  {
    code: 'NP000967',
    firstName: 'Niveau3GD',
    upline: 'NP000964',
    leg: Leg.RIGHT,
  },
  {
    code: 'NP000968',
    firstName: 'Niveau3DG',
    upline: 'NP000965',
    leg: Leg.LEFT,
  },
  {
    code: 'NP000969',
    firstName: 'Niveau3DD',
    upline: 'NP000965',
    leg: Leg.RIGHT,
  },
];

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
   * Les 7 comptes d'amorçage, créés PAR LES VRAIS SERVICES (inscription puis activation) :
   * dupliquer ici la propagation de points produirait un arbre incohérent avec le code.
   *
   * L'activation se fait des FEUILLES vers la RACINE. Conséquence assumée : chaque nœud est
   * encore INSCRIT quand ses downlines s'activent — sa pool appariable ne reçoit rien (c'est
   * la baseline par construction, D-035) et les commissions DIRECTES s'écrivent
   * `eligible=false` (sponsor pas encore ACTIF, D-034). Le premier run de commissions ne
   * verse donc rien à ce réseau synthétique. (Activer la racine en premier lui laisserait
   * 3000/3000 en pool, soit 3 équilibres payés dès le premier vendredi.)
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
    await this.prisma
      .$executeRaw`SELECT setval('member_code_seq', ${SEED_LAST_MEMBER_NUMBER - NETWORK.length}::bigint, true)`;

    const pack = await this.prisma.pack.findUniqueOrThrow({
      where: { name: SEED_PACK },
    });
    const ids = new Map<string, number>();

    // ── Inscriptions, top-down ──
    for (const node of NETWORK) {
      const id = node.upline
        ? await this.registerSeedMember(
            node.code,
            node.firstName,
            node.upline,
            node.leg!,
          )
        : await this.createRootMember(node.code, node.firstName);
      ids.set(node.code, id);
    }

    // ── Activations, feuilles → racine ──
    // On dote chaque compte du MONTANT DÛ en dinars — prix du pack moins l'acompte déjà versé
    // à l'inscription (D-029 + D-037) —, puis on active : la stratégie de paiement par solde
    // débite exactement ce montant et le solde retombe à zéro. L'arbre, lui, reçoit le palier
    // en POINTS : les deux dimensions se croisent dans l'activation sans jamais se convertir
    // (D-028). La racine n'est pas passée par l'inscription : son acompte vaut 0, elle paie
    // donc le prix plein — et c'est exact, elle n'a rien versé.
    for (const node of [...NETWORK].reverse()) {
      const memberId = ids.get(node.code)!;
      const member = await this.prisma.member.findUniqueOrThrow({
        where: { id: memberId },
        select: { registrationPaidDt: true },
      });
      await this.ledgerAdmin.genesis({
        adminId: await this.adminId(),
        memberId,
        amountDt: pack.priceDt.minus(member.registrationPaidDt),
        reason: `Amorçage du réseau (D-019) — ${node.code}`,
      });
      await this.activation.activate({ memberId, packId: pack.id });
    }

    this.logger.log(
      `Réseau d’amorçage créé : ${NETWORK.length} comptes ACTIFS (${ROOT_CODE} → NP000969), pack ${pack.name}.`,
    );
  }

  /** La racine n'a ni sponsor ni upline : elle ne peut pas passer par l'inscription normale. */
  private async createRootMember(
    code: string,
    firstName: string,
  ): Promise<number> {
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, this.bcryptRounds());
    return this.prisma.$transaction(async (tx) => {
      const memberCode = await this.memberCode.allocate(tx);
      this.assertCode(memberCode, code);
      const member = await tx.member.create({
        data: {
          memberCode,
          lastName: 'Najah',
          firstName,
          email: `${code.toLowerCase()}@najah.local`,
          passwordHash,
          status: MemberStatus.REGISTERED,
        },
        select: { id: true },
      });
      return member.id;
    });
  }

  /**
   * L'inscription se règle par e-card depuis D-036 : on génère pour chaque compte d'amorçage
   * une e-card de GENÈSE du montant exact des frais. C'est cohérent avec l'esprit du seed —
   * l'amorçage crée la valeur ex nihilo (D-017b), il ne la fait pas surgir dans un solde — et
   * cela fait passer les comptes de seed par le VRAI chemin d'inscription, contrôles compris.
   */
  private async registerSeedMember(
    code: string,
    firstName: string,
    uplineCode: string,
    leg: Leg,
  ): Promise<number> {
    const feeDt = await this.fees.read(REGISTRATION_FEE_SETTING);
    const ecard = await this.ecards.genesis({
      adminId: await this.adminId(),
      valueDt: feeDt,
      reason: `Amorçage du réseau (D-019) — frais d’inscription ${code}`,
    });

    const member = await this.members.register({
      lastName: 'Najah',
      firstName,
      email: `${code.toLowerCase()}@najah.local`,
      password: SEED_PASSWORD,
      sponsorCode: uplineCode, // le sponsor d'amorçage est aussi l'upline de placement
      uplineCode,
      leg,
      ecardCodes: [ecard.code],
    });
    this.assertCode(member.memberCode, code);
    return member.id;
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
