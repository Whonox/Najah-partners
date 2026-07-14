import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Leg, MemberStatus, Prisma, ProductType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BvAdminService } from '../bv-ledger/bv-admin.service';
import { ActivationService } from '../members/activation.service';
import {
  MemberCodeService,
  SEED_LAST_MEMBER_NUMBER,
} from '../members/member-code.service';
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
    private readonly bvAdmin: BvAdminService,
    private readonly memberCode: MemberCodeService,
  ) {}

  async run(): Promise<void> {
    await this.referenceData();
    await this.catalog();
    await this.bootstrapNetwork();
    await this.alignMemberCodeSequence();
  }

  /**
   * Catalogue d'amorçage (spec §5.7). Les valeurs BV sont choisies pour se COMBINER
   * exactement vers chaque palier (D-006) — sans quoi aucun panier d'activation ne serait
   * composable : 250 / 500 / 1000 / 2000 couvrent 1000, 2000, 3000 et 4000.
   *
   * On y trouve les cas qui comptent : un VIRTUEL (stock illimité, `null`), un physique en
   * promotion (le prix DT baisse, le BV ne bouge pas — D-002), et des frais de livraison
   * (affichés, réglés hors système, jamais dans le montant BV dû).
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
        priceDt: new Prisma.Decimal(product.priceDt),
        valueBv: product.valueBv,
        type: product.type,
        stock: product.stock,
        shippingFeeDt: new Prisma.Decimal(product.shippingFeeDt ?? 0),
        promoPriceDt:
          product.promoPriceDt === undefined
            ? null
            : new Prisma.Decimal(product.promoPriceDt),
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
      `Catalogue : ${categories.length} catégories, ${products.length} produits (BV 250/500/1000/2000 → paliers 1000/2000/3000/4000).`,
    );
  }

  /** Packs, paramètres système, admin initial — idempotents par upsert. */
  private async referenceData(): Promise<void> {
    const packs = [
      {
        name: 'Silver',
        tierBv: 1000,
        refPriceDt: 2200,
        directCommissionBv: 500,
        indirectCommissionBv: 250,
        weeklyCapBv: 10000,
      },
      {
        name: 'Gold',
        tierBv: 2000,
        refPriceDt: 3350,
        directCommissionBv: 700,
        indirectCommissionBv: 400,
        weeklyCapBv: 16000,
      },
      {
        name: 'Safari',
        tierBv: 3000,
        refPriceDt: 5400,
        directCommissionBv: 900,
        indirectCommissionBv: 600,
        weeklyCapBv: 24000,
      },
      {
        name: 'Diamond',
        tierBv: 4000,
        refPriceDt: 8350,
        directCommissionBv: 1200,
        indirectCommissionBv: 900,
        weeklyCapBv: 36000,
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
        key: 'startup_bonus_default',
        value: '6',
        description:
          'Réserve de paliers de bonus de démarrage figée à l’activation',
      },
      {
        key: 'ecard_expiration_days',
        value: '180',
        description:
          'Durée de validité des e-cards en jours (-1 = illimité) — 180 j À CONFIRMER avec la cliente (D-008)',
      },
      {
        key: 'annual_renewal_bv',
        value: '0',
        description:
          'Valeur BV du renouvellement annuel (à confirmer avec la cliente)',
      },
      {
        key: 'commission_cron_day',
        value: 'FRIDAY',
        description: 'Jour de clôture du run hebdomadaire',
      },
      {
        key: 'commission_cron_time',
        value: '23:59',
        description: 'Heure de clôture (heure de Tunis)',
      },
      {
        key: 'commission_timezone',
        value: 'Africa/Tunis',
        description: 'Fuseau horaire des runs de commissions',
      },
      {
        key: 'member_code_prefix',
        value: 'NP',
        description: 'Préfixe du code membre auto-incrémenté',
      },
      {
        key: 'display_currency',
        value: 'DT',
        description: 'Devise d’affichage (jamais transactionnelle)',
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
   * L'activation se fait des FEUILLES vers la RACINE. Conséquence assumée : chaque nœud fige
   * sa baseline APRÈS avoir reçu les points de ses downlines, donc ses points éligibles valent
   * 0 et le premier run de commissions ne verse rien à ce réseau synthétique. (Activer la
   * racine en premier lui laisserait 3000/3000 sur une baseline nulle, soit 3 cycles payés
   * dès le premier vendredi.)
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
    for (const node of [...NETWORK].reverse()) {
      const memberId = ids.get(node.code)!;
      await this.bvAdmin.genesis({
        adminId: await this.adminId(),
        memberId,
        amountBv: pack.tierBv,
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

  private async registerSeedMember(
    code: string,
    firstName: string,
    uplineCode: string,
    leg: Leg,
  ): Promise<number> {
    const member = await this.members.register({
      lastName: 'Najah',
      firstName,
      email: `${code.toLowerCase()}@najah.local`,
      password: SEED_PASSWORD,
      sponsorCode: uplineCode, // le sponsor d'amorçage est aussi l'upline de placement
      uplineCode,
      leg,
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
