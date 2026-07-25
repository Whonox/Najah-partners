import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RunStatus } from '@prisma/client';
import { ZERO_DT, money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionExplainService } from './commission-explain.service';
import {
  PendingEventsDto,
  RunDetailDto,
  RunMemberEventsDto,
  RunMemberPageDto,
  RunMemberRefDto,
  RunPageDto,
  RunSummaryDto,
} from './dto/commissions-response.dto';
import { RunMembersQueryDto, RunsQueryDto } from './dto/runs-query.dto';
import { latestClosedPeriod, nextClosingAt } from './period';

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
 * stockée — `Commission` n'en garde que l'agrégat. Elle est donc REJOUÉE, et elle l'est dans
 * `CommissionExplainService` (D-047), que ce service et le portail affilié partagent : une
 * seule implémentation, donc une seule explication d'un même versement.
 */
@Injectable()
export class CommissionsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly explain: CommissionExplainService,
  ) {}

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
   * montant ? ».
   *
   * DÉLÉGUÉE à `CommissionExplainService` depuis la Tranche 9, parce que le PORTAIL AFFILIÉ
   * pose la même question sur le même règlement. Deux implémentations auraient fini par donner
   * deux explications d'un même versement — l'une à l'administration, l'autre au membre qui la
   * conteste. Il n'y en a donc qu'une, et c'est elle.
   */
  memberEvents(runId: number, memberId: number): Promise<RunMemberEventsDto> {
    return this.explain.memberEvents(runId, memberId);
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
