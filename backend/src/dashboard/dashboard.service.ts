import { Injectable } from '@nestjs/common';
import {
  EcardStatus,
  MemberStatus,
  MembershipPaymentStatus,
  MembershipPaymentType,
  Prisma,
  RunStatus,
  VerificationStatus,
} from '@prisma/client';
import {
  latestClosedPeriod,
  nextClosingAt,
  tunisDayStart,
} from '../commissions/period';
import { ZERO_DT, money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  DashboardDto,
  DashboardPackRowDto,
  DashboardSeriesPointDto,
} from './dto/dashboard-response.dto';

const DEFAULT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Tunis = UTC+1 fixe (voir `commissions/period.ts`) : le jour civil tunisien en SQL. */
const TUNIS_SQL_OFFSET = "interval '1 hour'";

/** Ligne d'un regroupement par jour (`count` casté en `::int` : un bigint casserait le JSON). */
interface DayCountRow {
  day: string;
  count: number;
}

/**
 * Agrégats du tableau de bord (spec §7.2.1). Service de LECTURE : il ne calcule aucune règle,
 * il compte des lignes déjà écrites. Tout ce qui est affiché ici a été décidé ailleurs — par
 * une activation, un run, un paiement — et le tableau de bord n'en est que le miroir.
 *
 * Deux points de vigilance qui ont dicté l'implémentation :
 *
 *  - **le calendrier est celui de Tunis** (UTC+1 fixe, D-009), jamais UTC : compter « depuis
 *    minuit UTC » afficherait, entre 00:00 et 01:00 heure locale, les activations de la veille ;
 *  - **la semaine est celle du MOTEUR** (vendredi 23:59 → vendredi 23:59), pas la semaine
 *    civile : c'est la seule qui corresponde à ce que le prochain run paiera. Inventer un
 *    second calendrier ferait deux vérités.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(days = DEFAULT_DAYS, now = new Date()): Promise<DashboardDto> {
    const dayStart = tunisDayStart(now);
    // La clôture atteinte la plus récente = le début de la semaine EN COURS.
    const weekStart = latestClosedPeriod(now).end;
    const windowStart = new Date(dayStart.getTime() - (days - 1) * DAY_MS);

    const [
      statusGroups,
      activationsToday,
      activationsThisWeek,
      activationsTotal,
      packGroups,
      packs,
      ecardGroups,
      balanceSum,
      lastRun,
      distributed,
      identityPending,
      renewalsPending,
      registrationsByDay,
      activationsByDay,
      membersBeforeWindow,
    ] = await Promise.all([
      this.prisma.member.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.member.count({ where: { activatedAt: { gte: dayStart } } }),
      this.prisma.member.count({ where: { activatedAt: { gte: weekStart } } }),
      this.prisma.member.count({ where: { activatedAt: { not: null } } }),
      this.prisma.member.groupBy({
        by: ['packId'],
        where: { packId: { not: null }, activatedAt: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.pack.findMany({ orderBy: { tierBv: 'asc' } }),
      this.prisma.ecard.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { valueDt: true },
      }),
      this.prisma.member.aggregate({ _sum: { balanceDt: true } }),
      this.prisma.commissionRun.findFirst({ orderBy: { executedAt: 'desc' } }),
      this.prisma.commissionRun.aggregate({
        where: { status: RunStatus.SUCCESS },
        _sum: { distributedDt: true },
      }),
      this.prisma.member.count({
        where: { verificationStatus: VerificationStatus.PENDING },
      }),
      this.prisma.membershipPayment.count({
        where: {
          type: MembershipPaymentType.RENEWAL,
          status: MembershipPaymentStatus.PENDING_VALIDATION,
        },
      }),
      this.countByDay('registeredAt', windowStart),
      this.countByDay('activatedAt', windowStart),
      this.prisma.member.count({ where: { registeredAt: { lt: windowStart } } }),
    ]);

    const byStatus = (status: MemberStatus) =>
      statusGroups.find((row) => row.status === status)?._count._all ?? 0;
    const ecardsOf = (status: EcardStatus) => {
      const row = ecardGroups.find((entry) => entry.status === status);
      return {
        count: row?._count._all ?? 0,
        valueDt: row?._sum.valueDt ? money(row._sum.valueDt) : ZERO_DT,
      };
    };

    const active = ecardsOf(EcardStatus.ACTIVE);
    const used = ecardsOf(EcardStatus.USED);
    const balances = balanceSum._sum.balanceDt
      ? money(balanceSum._sum.balanceDt)
      : ZERO_DT;

    return {
      members: {
        total: statusGroups.reduce((sum, row) => sum + row._count._all, 0),
        active: byStatus(MemberStatus.ACTIVE),
        registered: byStatus(MemberStatus.REGISTERED),
        inactive: byStatus(MemberStatus.INACTIVE),
      },
      activations: {
        today: activationsToday,
        thisWeek: activationsThisWeek,
        total: activationsTotal,
      },
      packs: this.toPackRows(packs, packGroups),
      ecards: {
        activeCount: active.count,
        activeValueDt: moneyToApi(active.valueDt),
        usedCount: used.count,
        usedValueDt: moneyToApi(used.valueDt),
      },
      circulation: {
        memberBalancesDt: moneyToApi(balances),
        activeEcardsDt: moneyToApi(active.valueDt),
        totalDt: moneyToApi(balances.plus(active.valueDt)),
      },
      tasks: { identityPending, renewalsPending },
      lastRun: lastRun
        ? {
            id: lastRun.id,
            executedAt: lastRun.executedAt,
            periodStart: lastRun.periodStart,
            periodEnd: lastRun.periodEnd,
            memberCount: lastRun.memberCount,
            distributedDt: moneyToApi(money(lastRun.distributedDt)),
            rewardPointsGranted: lastRun.rewardPointsGranted,
            status: lastRun.status,
          }
        : null,
      nextRunAt: nextClosingAt(now),
      totalDistributedDt: moneyToApi(
        distributed._sum.distributedDt
          ? money(distributed._sum.distributedDt)
          : ZERO_DT,
      ),
      series: this.toSeries(
        windowStart,
        days,
        registrationsByDay,
        activationsByDay,
        membersBeforeWindow,
      ),
    };
  }

  private toPackRows(
    packs: { id: number; name: string; tierBv: number }[],
    groups: { packId: number | null; _count: { _all: number } }[],
  ): DashboardPackRowDto[] {
    return packs.map((pack) => ({
      packId: pack.id,
      packName: pack.name,
      tierBv: pack.tierBv,
      memberCount:
        groups.find((row) => row.packId === pack.id)?._count._all ?? 0,
    }));
  }

  /**
   * Regroupement par jour CIVIL TUNISIEN, fait par Postgres. Le décalage est appliqué avant le
   * `date_trunc` : tronquer en UTC puis décaler rangerait une activation de 00:30 heure de
   * Tunis dans la veille.
   *
   * Le nom de colonne n'est pas interpolable en paramètre lié — il est donc contraint par le
   * TYPE de l'argument, jamais par une chaîne libre venue d'une requête HTTP.
   */
  private countByDay(
    column: 'registeredAt' | 'activatedAt',
    from: Date,
  ): Promise<DayCountRow[]> {
    const field = Prisma.raw(`"${column}"`);
    return this.prisma.$queryRaw<DayCountRow[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', ${field} + ${Prisma.raw(TUNIS_SQL_OFFSET)}), 'YYYY-MM-DD') AS day,
             count(*)::int AS count
        FROM "Member"
       WHERE ${field} >= ${from}
       GROUP BY 1
       ORDER BY 1
    `);
  }

  /**
   * Une entrée par jour, SANS TROU : un graphe qui saute les jours creux ment sur le rythme —
   * trois inscriptions en trois jours et trois inscriptions en trois semaines dessineraient la
   * même courbe. Le cumul démarre à l'effectif d'avant la fenêtre, sinon la courbe de
   * croissance partirait de zéro et laisserait croire que le réseau vient de naître.
   */
  private toSeries(
    windowStart: Date,
    days: number,
    registrations: DayCountRow[],
    activations: DayCountRow[],
    membersBeforeWindow: number,
  ): DashboardSeriesPointDto[] {
    const index = (rows: DayCountRow[]) =>
      new Map(rows.map((row) => [row.day, row.count]));
    const registrationsByDay = index(registrations);
    const activationsByDay = index(activations);

    let cumulative = membersBeforeWindow;
    const series: DashboardSeriesPointDto[] = [];

    for (let offset = 0; offset < days; offset += 1) {
      const day = this.tunisDayLabel(
        new Date(windowStart.getTime() + offset * DAY_MS),
      );
      const dayRegistrations = registrationsByDay.get(day) ?? 0;
      cumulative += dayRegistrations;
      series.push({
        day,
        registrations: dayRegistrations,
        activations: activationsByDay.get(day) ?? 0,
        cumulativeMembers: cumulative,
      });
    }

    return series;
  }

  /** `YYYY-MM-DD` du jour tunisien contenant cet instant — même convention que le SQL ci-dessus. */
  private tunisDayLabel(instant: Date): string {
    return new Date(instant.getTime() + 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }
}
