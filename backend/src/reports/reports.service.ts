import { Injectable } from '@nestjs/common';
import {
  EcardOrigin,
  EcardStatus,
  LedgerMovementType,
  OrderContext,
  OrderStatus,
  Prisma,
  RunStatus,
} from '@prisma/client';
import {
  Money,
  ZERO_DT,
  money,
  moneyFromSql,
  moneyToApi,
} from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivationsByPackRowDto,
  CirculationReportDto,
  CommissionsPeriodRowDto,
  SalesReportDto,
  TopAffiliateRowDto,
} from './dto/reports-response.dto';
import {
  ReportPeriodQueryDto,
  TopAffiliatesQueryDto,
} from './dto/reports-query.dto';

/** Lignes brutes des requêtes SQL : montants relus en `::text`, entiers en `::int`. */
interface ProductSalesRow {
  productId: number;
  productName: string;
  categoryName: string | null;
  quantity: number;
  totalDt: string;
  totalPoints: number;
  orderCount: number;
}

interface PackActivationRow {
  packId: number;
  packName: string;
  tierBv: number;
  activationCount: number;
  injectedPoints: number;
  collectedDt: string;
}

interface RunAggregateRow {
  runId: number;
  periodStart: Date;
  periodEnd: Date;
  executedAt: Date;
  status: string;
  memberCount: number;
  paidDt: string;
  grossDt: string;
  rewardPointsGranted: number;
  rewardPointsLost: number;
}

/**
 * Rapports et analytics (spec §7.2.10) — LECTURE seule, agrégats délégués à Postgres.
 *
 * DEUX PRÉCAUTIONS QUI EXPLIQUENT LE CODE :
 *
 *  1. **Les montants ne traversent jamais un flottant.** Les sommes SQL sont relues en `::text`
 *     puis reconstruites en `Decimal` (`moneyFromSql`). Un rapport financier qui additionne en
 *     `double` finit par afficher un millime de trop, et c'est ce chiffre-là qu'on recopie dans
 *     une déclaration.
 *  2. **Les deux dimensions restent séparées** (D-028). Un rapport de ventes porte un total en
 *     DINARS *et* un total en POINTS, cote à cote, jamais l'un déduit de l'autre. Le montant
 *     encaissé à l'ACTIVATION est d'ailleurs le prix du pack moins l'acompte (D-029 + D-037), pas
 *     la somme des prix du panier : c'est pourquoi le rapport « activations par pack » lit les
 *     commandes d'activation, et non les lignes de produits.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(query: ReportPeriodQueryDto = {}): Promise<SalesReportDto> {
    const range = this.orderRange(query);

    const [products, byContext] = await Promise.all([
      this.prisma.$queryRaw<ProductSalesRow[]>(Prisma.sql`
        SELECT p."id"                                              AS "productId",
               p."name"                                            AS "productName",
               c."name"                                            AS "categoryName",
               COALESCE(SUM(l."quantity"), 0)::int                 AS "quantity",
               COALESCE(SUM(l."quantity" * l."unitPriceDt"), 0)::text AS "totalDt",
               COALESCE(SUM(l."quantity" * l."unitValueBv"), 0)::int  AS "totalPoints",
               COUNT(DISTINCT o."id")::int                         AS "orderCount"
          FROM "OrderLine" l
          JOIN "Order" o    ON o."id" = l."orderId"
          JOIN "Product" p  ON p."id" = l."productId"
          LEFT JOIN "Category" c ON c."id" = p."categoryId"
         WHERE o."status" = 'PAID'::"OrderStatus"
           ${range.sql}
         GROUP BY p."id", p."name", c."name"
         ORDER BY "totalDt" DESC, p."name" ASC
      `),
      this.prisma.order.groupBy({
        by: ['context'],
        where: { status: OrderStatus.PAID, ...range.where },
        _count: { _all: true },
        _sum: { totalDt: true, totalPoints: true },
      }),
    ]);

    return {
      products: products.map((row) => ({
        productId: row.productId,
        productName: row.productName,
        categoryName: row.categoryName,
        quantity: row.quantity,
        totalDt: moneyToApi(moneyFromSql(row.totalDt)),
        totalPoints: row.totalPoints,
        orderCount: row.orderCount,
      })),
      byContext: byContext.map((row) => ({
        context: row.context,
        orderCount: row._count._all,
        totalDt: moneyToApi(
          row._sum.totalDt ? money(row._sum.totalDt) : ZERO_DT,
        ),
        totalPoints: row._sum.totalPoints ?? 0,
      })),
    };
  }

  /**
   * Activations par pack. Le montant encaissé vient de la COMMANDE d'activation (prix du pack −
   * acompte, D-037) et non du pack vivant : un pack revalorisé depuis ne doit pas réécrire ce que
   * la période a réellement encaissé. Les points, eux, viennent du snapshot d'activation du
   * membre — le palier ENTIER que l'arbre a reçu.
   *
   * `LEFT JOIN` sur les packs : un pack sans activation doit apparaître à zéro, sinon l'absence
   * se lirait comme un oubli du rapport.
   */
  async activationsByPack(
    query: ReportPeriodQueryDto = {},
  ): Promise<ActivationsByPackRowDto[]> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    const rows = await this.prisma.$queryRaw<PackActivationRow[]>(Prisma.sql`
      SELECT pk."id"                                          AS "packId",
             pk."name"                                        AS "packName",
             pk."tierBv"                                      AS "tierBv",
             COUNT(m."id")::int                               AS "activationCount",
             COALESCE(SUM(m."activationTierBv"), 0)::int      AS "injectedPoints",
             COALESCE(SUM(o."totalDt"), 0)::text              AS "collectedDt"
        FROM "Pack" pk
        LEFT JOIN "Member" m
               ON m."packId" = pk."id"
              AND m."activatedAt" IS NOT NULL
              ${from ? Prisma.sql`AND m."activatedAt" >= ${from}` : Prisma.empty}
              ${to ? Prisma.sql`AND m."activatedAt" <= ${to}` : Prisma.empty}
        LEFT JOIN "Order" o
               ON o."memberId" = m."id"
              AND o."context" = 'ACTIVATION'::"OrderContext"
              AND o."status" = 'PAID'::"OrderStatus"
       GROUP BY pk."id", pk."name", pk."tierBv"
       ORDER BY pk."tierBv" ASC
    `);

    return rows.map((row) => ({
      packId: row.packId,
      packName: row.packName,
      tierBv: row.tierBv,
      activationCount: row.activationCount,
      collectedDt: moneyToApi(moneyFromSql(row.collectedDt)),
      injectedPoints: row.injectedPoints,
    }));
  }

  /**
   * Commissions par période = par RUN : la « période » du plan de rémunération est la semaine du
   * moteur (vendredi 23:59 Tunis, D-009). Regrouper par mois civil mélangerait deux plafonds
   * hebdomadaires et rendrait la colonne « perdu au plafond » inexplicable.
   */
  async commissions(
    query: ReportPeriodQueryDto = {},
  ): Promise<CommissionsPeriodRowDto[]> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    const rows = await this.prisma.$queryRaw<RunAggregateRow[]>(Prisma.sql`
      SELECT r."id"                                       AS "runId",
             r."periodStart", r."periodEnd", r."executedAt",
             r."status"::text                             AS "status",
             r."memberCount",
             r."distributedDt"::text                      AS "paidDt",
             r."rewardPointsGranted",
             COALESCE(SUM(c."grossDt"), 0)::text          AS "grossDt",
             COALESCE(SUM(c."rewardPointsLost"), 0)::int  AS "rewardPointsLost"
        FROM "CommissionRun" r
        LEFT JOIN "Commission" c ON c."runId" = r."id"
       WHERE 1 = 1
         ${from ? Prisma.sql`AND r."periodEnd" >= ${from}` : Prisma.empty}
         ${to ? Prisma.sql`AND r."periodEnd" <= ${to}` : Prisma.empty}
       GROUP BY r."id"
       ORDER BY r."periodEnd" DESC, r."id" DESC
    `);

    return rows.map((row) => {
      const gross = moneyFromSql(row.grossDt);
      const paid = moneyFromSql(row.paidDt);
      return {
        runId: row.runId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        executedAt: row.executedAt,
        status: row.status as RunStatus,
        memberCount: row.memberCount,
        paidDt: moneyToApi(paid),
        grossDt: moneyToApi(gross),
        // Perdu = éligible − versé. De l'ARGENT perdu (D-033) — les POINTS, eux, sont restés en
        // carry-over : les deux « débordements » ne se confondent pas.
        lostDt: moneyToApi(gross.minus(paid)),
        rewardPointsGranted: row.rewardPointsGranted,
        rewardPointsLost: row.rewardPointsLost,
      };
    });
  }

  /** Les dinars du système, décomposés par NATURE (jamais un seul chiffre global muet). */
  async circulation(): Promise<CirculationReportDto> {
    const [
      balances,
      activeEcards,
      usedEcards,
      genesisEcards,
      genesisBalance,
      commissions,
    ] = await Promise.all([
      this.prisma.member.aggregate({ _sum: { balanceDt: true } }),
      this.prisma.ecard.aggregate({
        where: { status: EcardStatus.ACTIVE },
        _sum: { valueDt: true },
      }),
      this.prisma.ecard.aggregate({
        where: { status: EcardStatus.USED },
        _sum: { valueDt: true },
      }),
      this.prisma.ecard.aggregate({
        where: { origin: EcardOrigin.GENESIS },
        _sum: { valueDt: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { type: LedgerMovementType.ADMIN_GENESIS },
        _sum: { amountDt: true },
      }),
      this.prisma.commissionRun.aggregate({
        where: { status: RunStatus.SUCCESS },
        _sum: { distributedDt: true },
      }),
    ]);

    const sum = (value: Prisma.Decimal | null): Money =>
      value ? money(value) : ZERO_DT;

    const memberBalances = sum(balances._sum.balanceDt);
    const active = sum(activeEcards._sum.valueDt);

    return {
      memberBalancesDt: moneyToApi(memberBalances),
      activeEcardsDt: moneyToApi(active),
      inSystemDt: moneyToApi(memberBalances.plus(active)),
      consumedEcardsDt: moneyToApi(sum(usedEcards._sum.valueDt)),
      genesisEcardsDt: moneyToApi(sum(genesisEcards._sum.valueDt)),
      genesisBalanceDt: moneyToApi(sum(genesisBalance._sum.amountDt)),
      commissionsPaidDt: moneyToApi(sum(commissions._sum.distributedDt)),
    };
  }

  /**
   * Top affiliés par commissions PERÇUES sur la période. « Perçues » et non « dues » : c'est le
   * versement réel (`paidDt`) qui classe, plafond appliqué — sinon le classement récompenserait
   * un gros brut qui n'a jamais été payé.
   */
  async topAffiliates(
    query: TopAffiliatesQueryDto = {},
  ): Promise<TopAffiliateRowDto[]> {
    const limit = query.limit ?? 10;
    const where: Prisma.CommissionWhereInput =
      query.from || query.to
        ? {
            run: {
              periodEnd: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            },
          }
        : {};

    const grouped = await this.prisma.commission.groupBy({
      by: ['memberId'],
      where,
      _sum: { paidDt: true },
      _count: { _all: true },
      orderBy: { _sum: { paidDt: 'desc' } },
      take: limit,
    });
    if (grouped.length === 0) {
      return [];
    }

    const members = await this.prisma.member.findMany({
      where: { id: { in: grouped.map((row) => row.memberId) } },
      select: {
        id: true,
        memberCode: true,
        firstName: true,
        lastName: true,
        lifetimeBalanceCount: true,
        rewardPoints: true,
        pack: { select: { name: true } },
      },
    });
    const byId = new Map(members.map((member) => [member.id, member]));

    // L'ordre de `grouped` (par montant décroissant) fait foi : `findMany` rend les membres dans
    // l'ordre des ids, ce qui n'est pas un classement.
    return grouped.flatMap((row) => {
      const member = byId.get(row.memberId);
      if (!member) {
        return [];
      }
      return [
        {
          memberId: member.id,
          memberCode: member.memberCode,
          firstName: member.firstName,
          lastName: member.lastName,
          packName: member.pack?.name ?? null,
          paidDt: moneyToApi(
            row._sum.paidDt ? money(row._sum.paidDt) : ZERO_DT,
          ),
          runCount: row._count._all,
          lifetimeBalanceCount: member.lifetimeBalanceCount,
          rewardPoints: member.rewardPoints,
        },
      ];
    });
  }

  /**
   * Fenêtre sur les COMMANDES, sous deux formes : un fragment SQL pour les requêtes brutes et un
   * `where` Prisma pour les autres. Écrire deux fois la même borne ferait un jour diverger deux
   * chiffres du même écran.
   */
  private orderRange(query: ReportPeriodQueryDto): {
    sql: Prisma.Sql;
    where: Prisma.OrderWhereInput;
  } {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    return {
      sql: Prisma.sql`
        ${from ? Prisma.sql`AND o."createdAt" >= ${from}` : Prisma.empty}
        ${to ? Prisma.sql`AND o."createdAt" <= ${to}` : Prisma.empty}
      `,
      where:
        from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {},
    };
  }
}
