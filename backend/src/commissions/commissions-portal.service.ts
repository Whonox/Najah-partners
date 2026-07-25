import { ForbiddenException, Injectable } from '@nestjs/common';
import { CommissionEventType } from '@prisma/client';
import { ZERO_DT, money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionExplainService } from './commission-explain.service';
import {
  MyCommissionPageDto,
  MyCommissionRowDto,
} from './dto/commissions-portal.dto';
import { RunMemberEventsDto } from './dto/commissions-response.dto';

const DEFAULT_PAGE_SIZE = 20;

/**
 * MES commissions (spec §7.1, portail affilié). Lecture pure : rien n'est recalculé, tout a
 * été décidé à l'activation (temps 1, D-035) puis réglé par le run (temps 2).
 *
 * La ventilation par événement passe par `CommissionExplainService`, LE service que la
 * supervision admin utilise déjà : l'affilié et l'administration lisent donc mot pour mot la
 * même explication d'un même versement. C'était la condition pour que cet écran serve à
 * quelque chose — un affilié qui conteste et un gestionnaire qui vérifie doivent voir la même
 * chose, sinon l'écran fabrique des réclamations au lieu de les éviter.
 */
@Injectable()
export class CommissionsPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly explain: CommissionExplainService,
  ) {}

  /** Mon historique par semaine du moteur, le plus récent d'abord. */
  async myRuns(
    memberId: number,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<MyCommissionPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const [rows, total, lifetime] = await Promise.all([
      this.prisma.commission.findMany({
        where: { memberId },
        orderBy: { runId: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          run: { select: { periodStart: true, periodEnd: true, executedAt: true } },
        },
      }),
      this.prisma.commission.count({ where: { memberId } }),
      this.prisma.commission.aggregate({
        where: { memberId },
        _sum: { grossDt: true, paidDt: true },
      }),
    ]);

    // Ventilation par NATURE, pour toute la page en une requête : sans elle, l'écran dirait
    // « 750 DT » sans jamais dire d'où ils viennent, et c'est précisément la question que pose
    // un affilié. Les événements portent leur type depuis leur écriture — rien n'est déduit.
    const runIds = rows.map((row) => row.runId);
    const byType = runIds.length
      ? await this.prisma.commissionEvent.groupBy({
          by: ['runId', 'type'],
          where: { memberId, runId: { in: runIds } },
          _count: { _all: true },
        })
      : [];

    const counts = new Map<string, number>();
    for (const group of byType) {
      counts.set(`${group.runId}:${group.type}`, group._count._all);
    }
    const count = (runId: number, type: CommissionEventType): number =>
      counts.get(`${runId}:${type}`) ?? 0;

    const items: MyCommissionRowDto[] = rows.map((row) => {
      const gross = money(row.grossDt);
      const paid = money(row.paidDt);
      return {
        runId: row.runId,
        periodStart: row.run.periodStart,
        periodEnd: row.run.periodEnd,
        executedAt: row.run.executedAt,
        grossDt: moneyToApi(gross),
        paidDt: moneyToApi(paid),
        // L'écart EST la perte au plafond, par construction du règlement (D-033).
        lostDt: moneyToApi(gross.minus(paid)),
        appliedCapDt: moneyToApi(money(row.appliedCapDt)),
        eventCount: row.eventCount,
        directCount: count(row.runId, CommissionEventType.DIRECT),
        balanceCount: count(row.runId, CommissionEventType.BALANCE),
        startupBonusCount: count(row.runId, CommissionEventType.STARTUP_BONUS),
        rewardPointEventCount: count(row.runId, CommissionEventType.REWARD_POINT),
        rewardPointsGranted: row.rewardPointsGranted,
        rewardPointsLost: row.rewardPointsLost,
      };
    });

    const lifetimeGross = lifetime._sum.grossDt
      ? money(lifetime._sum.grossDt)
      : ZERO_DT;
    const lifetimePaid = lifetime._sum.paidDt
      ? money(lifetime._sum.paidDt)
      : ZERO_DT;

    return {
      items,
      total,
      page,
      pageSize,
      lifetimePaidDt: moneyToApi(lifetimePaid),
      lifetimeLostDt: moneyToApi(lifetimeGross.minus(lifetimePaid)),
    };
  }

  /**
   * « Pourquoi ai-je touché ce montant cette semaine-là ? » — la chronologie détaillée.
   *
   * Le `memberId` vient du TOKEN et n'est jamais lu de l'URL : le seul paramètre acceptable est
   * le numéro de run. Un affilié ne peut donc pas demander la ventilation d'un autre en
   * changeant un chiffre dans la barre d'adresse.
   */
  async myRunEvents(
    memberId: number,
    runId: number,
  ): Promise<RunMemberEventsDto> {
    const result = await this.explain.memberEvents(runId, memberId);
    // Ceinture et bretelles : le service partagé rend l'identité du bénéficiaire ; si elle ne
    // correspondait pas au porteur du token, quelque chose de grave se serait produit en
    // amont. On refuse plutôt que de servir la réponse.
    if (result.member.id !== memberId) {
      throw new ForbiddenException();
    }
    return result;
  }
}
