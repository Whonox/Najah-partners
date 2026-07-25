import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RunStatus } from '@prisma/client';
import { ZERO_DT, money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  PendingEventsDto,
  RunDetailDto,
  RunEventDto,
  RunMemberEventsDto,
  RunMemberPageDto,
  RunMemberRefDto,
  RunPageDto,
  RunSummaryDto,
} from './dto/commissions-response.dto';
import { RunMembersQueryDto, RunsQueryDto } from './dto/runs-query.dto';
import { latestClosedPeriod, nextClosingAt } from './period';
import { SettleableEvent, settleWeek } from './settlement';

const DEFAULT_PAGE_SIZE = 20;

const MEMBER_REF_SELECT = {
  id: true,
  memberCode: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.MemberSelect;

/**
 * SUPERVISION du moteur (spec §7.2.7). Ce service ne calcule aucune commission et n'écrit rien :
 * il lit des runs et des événements déjà décidés (D-035 — les événements sont écrits au fil de
 * l'eau, à l'activation, et le run n'a fait qu'appliquer le plafond en chronologie).
 *
 * UNE exception assumée à la règle « on ne recalcule rien » : la ventilation PAR ÉVÉNEMENT
 * (combien cet événement a-t-il réellement payé, combien a-t-il perdu au plafond) n'est pas
 * stockée — `Commission` n'en garde que l'agrégat. Elle est donc rejouée par `settleWeek`,
 * c'est-à-dire par LA fonction qu'a exécutée le run, sur les MÊMES entrées (les événements
 * réclamés par ce run, et le plafond figé dans `Commission.appliedCapDt`). Le résultat est donc
 * l'explication exacte du versement, et non une reconstitution approchée. Écrire ici une
 * seconde logique de plafond aurait garanti qu'un jour l'écran explique autre chose que ce qui
 * a été payé.
 */
@Injectable()
export class CommissionsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listRuns(query: RunsQueryDto = {}): Promise<RunPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.CommissionRunWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            executedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [runs, total] = await this.prisma.$transaction([
      this.prisma.commissionRun.findMany({
        where,
        orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.commissionRun.count({ where }),
    ]);

    return {
      items: runs.map((run) => this.toSummary(run)),
      total,
      page,
      pageSize,
    };
  }

  async runDetail(runId: number): Promise<RunDetailDto> {
    const run = await this.prisma.commissionRun.findUnique({
      where: { id: runId },
    });
    if (!run) {
      throw new NotFoundException(`Run de commissions inconnu : ${runId}`);
    }

    const [settlements, eventsByEligibility, membersInEvents] =
      await Promise.all([
        this.prisma.commission.aggregate({
          where: { runId },
          _sum: { grossDt: true, paidDt: true, rewardPointsLost: true },
          _count: { _all: true },
        }),
        this.prisma.commissionEvent.groupBy({
          by: ['eligible'],
          where: { runId },
          _count: { _all: true },
          _sum: { amountDt: true },
        }),
        this.prisma.commissionEvent.groupBy({
          by: ['memberId'],
          where: { runId },
        }),
      ]);

    const gross = settlements._sum.grossDt
      ? money(settlements._sum.grossDt)
      : ZERO_DT;
    const paid = settlements._sum.paidDt
      ? money(settlements._sum.paidDt)
      : ZERO_DT;
    const ineligible = eventsByEligibility.find((row) => !row.eligible);

    return {
      run: this.toSummary(run),
      log: run.log,
      grossTotalDt: moneyToApi(gross),
      // Perdu = brut éligible − versé. C'est de l'ARGENT définitivement perdu (D-033) : les
      // POINTS, eux, ont été consommés et le carry-over reste en réserve — ne pas confondre.
      lostTotalDt: moneyToApi(gross.minus(paid)),
      rewardPointsLost: settlements._sum.rewardPointsLost ?? 0,
      eventCount: eventsByEligibility.reduce(
        (sum, row) => sum + row._count._all,
        0,
      ),
      ineligibleEventCount: ineligible?._count._all ?? 0,
      ineligibleGrossDt: moneyToApi(
        ineligible?._sum.amountDt ? money(ineligible._sum.amountDt) : ZERO_DT,
      ),
      unsettledMemberCount: Math.max(
        0,
        membersInEvents.length - settlements._count._all,
      ),
    };
  }

  async runMembers(
    runId: number,
    query: RunMembersQueryDto = {},
  ): Promise<RunMemberPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.commission.findMany({
        where: { runId },
        include: { member: { select: MEMBER_REF_SELECT } },
        // Les plus gros versements d'abord : c'est ce qu'un superviseur regarde en premier.
        orderBy: [{ paidDt: 'desc' }, { memberId: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.commission.count({ where: { runId } }),
    ]);

    return {
      items: rows.map((row) => {
        const gross = money(row.grossDt);
        const paid = money(row.paidDt);
        return {
          member: row.member,
          grossDt: moneyToApi(gross),
          paidDt: moneyToApi(paid),
          lostDt: moneyToApi(gross.minus(paid)),
          appliedCapDt: moneyToApi(money(row.appliedCapDt)),
          eventCount: row.eventCount,
          rewardPointsGranted: row.rewardPointsGranted,
          rewardPointsLost: row.rewardPointsLost,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  /**
   * La chronologie d'un membre sur un run : l'écran qui répond à « pourquoi ai-je touché ce
   * montant ? ». L'ordre est celui de l'application du plafond, `(occurredAt, id)` — le même
   * qu'a suivi le run (D-033 : sur une même activation, DIRECT avant BALANCE).
   */
  async memberEvents(
    runId: number,
    memberId: number,
  ): Promise<RunMemberEventsDto> {
    const [member, settlement, events] = await Promise.all([
      this.prisma.member.findUnique({
        where: { id: memberId },
        select: MEMBER_REF_SELECT,
      }),
      this.prisma.commission.findUnique({
        where: { memberId_runId: { memberId, runId } },
      }),
      this.prisma.commissionEvent.findMany({
        where: { runId, memberId },
        include: { sourceMember: { select: MEMBER_REF_SELECT } },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    if (!member) {
      throw new NotFoundException(`Membre inconnu : ${memberId}`);
    }
    if (events.length === 0) {
      throw new NotFoundException(
        `Aucun événement de commission pour le membre ${memberId} sur le run ${runId}.`,
      );
    }

    // Pas de règlement = tous les événements étaient inéligibles (le run passe le membre) :
    // le plafond n'a alors jamais eu à s'appliquer, et `settleWeek` le confirme en ne payant
    // rien. On lui passe donc un plafond nul, qui ne peut pas fabriquer un versement.
    const capDt = settlement ? money(settlement.appliedCapDt) : ZERO_DT;
    const settleable: SettleableEvent[] = events.map((event) => ({
      id: event.id,
      type: event.type,
      amountDt: money(event.amountDt),
      eligible: event.eligible,
      occurredAt: event.occurredAt,
    }));
    const replay = settleWeek(settleable, capDt);
    const lines = new Map(replay.lines.map((line) => [line.eventId, line]));

    const items: RunEventDto[] = events.map((event) => {
      const line = lines.get(event.id);
      const amount = money(event.amountDt);
      return {
        id: event.id,
        type: event.type,
        amountDt: moneyToApi(amount),
        occurredAt: event.occurredAt,
        sourceMember: event.sourceMember,
        eligible: event.eligible,
        balanceIndex: event.balanceIndex,
        cumulativeBeforeDt: moneyToApi(line?.cumulativeBeforeDt ?? ZERO_DT),
        paidDt: moneyToApi(line?.paidDt ?? ZERO_DT),
        // « Perdu » ne dit qu'une chose : perdu AU PLAFOND. Un événement inéligible affiche donc
        // 0 et non son montant — cette somme n'a jamais été due (D-034), et la compter comme
        // perdue casserait l'égalité « Σ perdu = brut − versé » du run. C'est l'indicateur
        // `eligible` qui porte l'information, et l'écran l'affiche en clair.
        lostDt: moneyToApi(line?.lostDt ?? ZERO_DT),
        crossesCap: line?.crossesCap ?? false,
        rewardPointGranted: line?.rewardPointGranted ?? false,
        rewardPointLost: line?.rewardPointLost ?? false,
      };
    });

    const gross = money(settlement?.grossDt ?? 0);
    const paid = money(settlement?.paidDt ?? 0);

    return {
      member,
      appliedCapDt: settlement ? moneyToApi(capDt) : null,
      grossDt: moneyToApi(gross),
      paidDt: moneyToApi(paid),
      lostDt: moneyToApi(gross.minus(paid)),
      events: items,
    };
  }

  /**
   * Ce que le PROCHAIN run paiera : les événements encore non réclamés (`runId IS NULL`). Le
   * montant est un dû BRUT — le plafond, lui, ne s'applique qu'au run, membre par membre.
   */
  async pendingEvents(now = new Date()): Promise<PendingEventsDto> {
    const period = latestClosedPeriod(now);
    const [byEligibility, members] = await Promise.all([
      this.prisma.commissionEvent.groupBy({
        by: ['eligible'],
        where: { runId: null },
        _count: { _all: true },
        _sum: { amountDt: true },
      }),
      this.prisma.commissionEvent.groupBy({
        by: ['memberId'],
        where: { runId: null },
      }),
    ]);

    const sumOf = (eligible: boolean) => {
      const row = byEligibility.find((entry) => entry.eligible === eligible);
      return row?._sum.amountDt ? money(row._sum.amountDt) : ZERO_DT;
    };

    return {
      eventCount: byEligibility.reduce((sum, row) => sum + row._count._all, 0),
      memberCount: members.length,
      eligibleGrossDt: moneyToApi(sumOf(true)),
      ineligibleGrossDt: moneyToApi(sumOf(false)),
      periodStart: period.end,
      periodEnd: nextClosingAt(now),
    };
  }

  private toSummary(run: {
    id: number;
    executedAt: Date;
    periodStart: Date;
    periodEnd: Date;
    memberCount: number;
    distributedDt: Prisma.Decimal;
    rewardPointsGranted: number;
    status: RunStatus;
    log: string | null;
  }): RunSummaryDto {
    return {
      id: run.id,
      executedAt: run.executedAt,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      memberCount: run.memberCount,
      distributedDt: moneyToApi(money(run.distributedDt)),
      rewardPointsGranted: run.rewardPointsGranted,
      status: run.status,
      hasLog: !!run.log,
    };
  }
}
