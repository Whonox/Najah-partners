import { Injectable, Logger } from '@nestjs/common';
import {
  CommissionEventType,
  LedgerMovementType,
  Prisma,
  RunStatus,
} from '@prisma/client';
import { Money, ZERO_DT, money, moneyFromSql, moneyToApi } from '../common/money';
import { LedgerService } from '../ledger/ledger.service';
import type { ActivationSnapshot } from '../members/members.types';
import { PrismaService } from '../prisma/prisma.service';
import { CorruptActivationSnapshotError } from './commissions.errors';
import { latestClosedPeriod, RunPeriod } from './period';
import { SettleableEvent, settleWeek } from './settlement';

/**
 * TEMPS 2 du moteur (D-035) : le run hebdomadaire n'INVENTE rien — les événements ont été
 * écrits au fil de l'eau à l'activation (temps 1), avec leurs montants figés et leur
 * éligibilité évaluée à l'instant même. Ici on ne fait qu'appliquer le plafond en
 * chronologie (D-033) et créditer les soldes (grand livre) et les Points Fidélité (D-032).
 *
 * IDEMPOTENCE — deux barrières indépendantes :
 *  1. un run SUCCESS existant pour la même période rend l'appel no-op (pilotage) ;
 *  2. la RÉCLAMATION (`SET runId WHERE runId IS NULL`) est la barrière DURE : un événement
 *     ne peut être réclamé qu'une fois, donc jamais payé deux fois — même si un re-run
 *     était forcé, il ne réclamerait rien et ne créditerait rien.
 *
 * ATOMICITÉ : tout le run tient dans UNE transaction. Un échec au dernier membre annule
 * tout — événements déréclamés, aucun crédit partiel — et la trace ERROR est persistée
 * HORS transaction (le rollback aurait effacé le run lui-même).
 *
 * VERROUILLAGE (D-024) : les membres sont réglés par id CROISSANT ; chaque crédit passe
 * par `LedgerService.recordMovementInTx`, qui verrouille la ligne en FOR NO KEY UPDATE.
 * L'acquisition globalement croissante des verrous `Member` — ici comme dans l'activation —
 * garde le graphe d'attente acyclique.
 */

const TX_TIMEOUT_MS = 120_000;

export interface RunResult {
  runId: number;
  periodStart: Date;
  periodEnd: Date;
  status: RunStatus;
  memberCount: number;
  /** DINARS versés (forme API, D-028). */
  distributedDt: string;
  rewardPointsGranted: number;
  /** Événements réclamés par ce run (payés, perdus et inéligibles confondus). */
  eventCount: number;
  /** true : un run SUCCESS existait déjà pour la période — rien n'a été refait. */
  alreadyExecuted: boolean;
}

/** Ligne brute de la réclamation (montant relu en texte : jamais de flottant, D-028). */
interface ClaimedEventRow {
  id: number;
  memberId: number;
  type: string;
  amountDt: string;
  occurredAt: Date;
  eligible: boolean;
}

@Injectable()
export class CommissionRunService {
  private readonly logger = new Logger(CommissionRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /** Le run « normal » : la dernière semaine close à l'instant donné (cron du vendredi). */
  async runLatestClosedPeriod(now: Date = new Date()): Promise<RunResult> {
    return this.runForPeriod(latestClosedPeriod(now));
  }

  /**
   * Run d'une période explicite — permet aussi de rattraper une semaine manquée (cron
   * arrêté) : les événements d'une période jamais réclamée attendent, rien n'est perdu.
   */
  async runForPeriod(period: RunPeriod): Promise<RunResult> {
    const existing = await this.prisma.commissionRun.findFirst({
      where: {
        periodStart: period.start,
        periodEnd: period.end,
        status: RunStatus.SUCCESS,
      },
    });
    if (existing) {
      return {
        runId: existing.id,
        periodStart: existing.periodStart,
        periodEnd: existing.periodEnd,
        status: existing.status,
        memberCount: existing.memberCount,
        distributedDt: moneyToApi(existing.distributedDt),
        rewardPointsGranted: existing.rewardPointsGranted,
        eventCount: 0,
        alreadyExecuted: true,
      };
    }

    try {
      return await this.prisma.$transaction(
        (tx) => this.executeInTx(tx, period),
        { timeout: TX_TIMEOUT_MS },
      );
    } catch (error) {
      // Le rollback a tout effacé, y compris la ligne de run : on persiste la trace ERROR
      // hors transaction pour la supervision (§7.2.7). Les événements restent réclamables.
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.commissionRun
        .create({
          data: {
            periodStart: period.start,
            periodEnd: period.end,
            status: RunStatus.ERROR,
            log: `Run échoué et annulé (aucun crédit versé) : ${message}`,
          },
        })
        .catch(() => undefined); // la trace ne doit pas masquer l'erreur d'origine
      throw error;
    }
  }

  private async executeInTx(
    tx: Prisma.TransactionClient,
    period: RunPeriod,
  ): Promise<RunResult> {
    const run = await tx.commissionRun.create({
      data: {
        periodStart: period.start,
        periodEnd: period.end,
        status: RunStatus.IN_PROGRESS,
      },
    });

    // ── RÉCLAMATION — la barrière d'idempotence. Les inéligibles sont réclamés aussi :
    //    ils sont ainsi soldés (tracés, jamais payés) au lieu d'errer indéfiniment.
    const claimed = await tx.$queryRaw<ClaimedEventRow[]>`
      UPDATE "CommissionEvent"
      SET "runId" = ${run.id}
      WHERE "runId" IS NULL
        AND "occurredAt" >= ${period.start}
        AND "occurredAt" < ${period.end}
      RETURNING "id", "memberId", "type"::text AS "type", "amountDt"::text AS "amountDt",
                "occurredAt", "eligible"
    `;

    const byMember = new Map<number, SettleableEvent[]>();
    for (const row of claimed) {
      const list = byMember.get(row.memberId) ?? [];
      list.push({
        id: row.id,
        type: row.type as CommissionEventType,
        amountDt: moneyFromSql(row.amountDt),
        occurredAt: row.occurredAt,
        eligible: row.eligible,
      });
      byMember.set(row.memberId, list);
    }

    // ── Règlement par membre, ids CROISSANTS (ordre de verrouillage D-024).
    const memberIds = [...byMember.keys()].sort((a, b) => a - b);
    let memberCount = 0;
    let distributed: Money = ZERO_DT;
    let rewardPointsGranted = 0;

    for (const memberId of memberIds) {
      const events = byMember.get(memberId)!;
      if (!events.some((event) => event.eligible)) {
        continue; // sponsor INSCRIT/gelé : événements soldés, aucun règlement (D-034, §10)
      }

      // Le plafond vient du SNAPSHOT D'ACTIVATION du membre — le moteur ne lit jamais
      // `Pack` en direct : modifier un pack ne touche que les activations postérieures.
      const member = await tx.member.findUnique({
        where: { id: memberId },
        select: { activationSnapshot: true },
      });
      const snapshot = member?.activationSnapshot as ActivationSnapshot | null;
      if (!snapshot || typeof snapshot.weeklyCapDt !== 'string') {
        throw new CorruptActivationSnapshotError(memberId);
      }
      const capDt = money(snapshot.weeklyCapDt);

      const settlement = settleWeek(events, capDt);

      const commission = await tx.commission.create({
        data: {
          memberId,
          runId: run.id,
          grossDt: settlement.grossDt,
          paidDt: settlement.paidDt,
          appliedCapDt: capDt,
          eventCount: settlement.eligibleCount,
          rewardPointsGranted: settlement.rewardPointsGranted,
          rewardPointsLost: settlement.rewardPointsLost,
          // Chaque ligne fige ses paramètres (spec §5.8) : le snapshot du membre et la
          // période — l'historique reste lisible même si tout bouge ensuite.
          snapshotParams: {
            ...snapshot,
            periodStart: period.start.toISOString(),
            periodEnd: period.end.toISOString(),
          } as Prisma.JsonObject,
        },
      });

      if (settlement.paidDt.greaterThan(0)) {
        await this.ledger.recordMovementInTx(tx, {
          memberId,
          type: LedgerMovementType.COMMISSION,
          amountDt: settlement.paidDt,
          commissionId: commission.id,
        });
      }
      if (settlement.rewardPointsGranted > 0) {
        await tx.member.update({
          where: { id: memberId },
          data: {
            rewardPoints: { increment: settlement.rewardPointsGranted },
          },
        });
      }
      if (settlement.paidEventIds.length > 0) {
        await tx.commissionEvent.updateMany({
          where: { id: { in: settlement.paidEventIds } },
          data: { paid: true },
        });
      }

      memberCount += 1;
      distributed = distributed.plus(settlement.paidDt);
      rewardPointsGranted += settlement.rewardPointsGranted;
    }

    const log =
      `Période ${period.start.toISOString()} → ${period.end.toISOString()} : ` +
      `${claimed.length} événement(s) réclamé(s), ${memberCount} membre(s) réglé(s), ` +
      `${moneyToApi(distributed)} DT versés, ${rewardPointsGranted} Point(s) Fidélité.`;
    await tx.commissionRun.update({
      where: { id: run.id },
      data: {
        status: RunStatus.SUCCESS,
        memberCount,
        distributedDt: distributed,
        rewardPointsGranted,
        log,
      },
    });
    this.logger.log(log);

    return {
      runId: run.id,
      periodStart: period.start,
      periodEnd: period.end,
      status: RunStatus.SUCCESS,
      memberCount,
      distributedDt: moneyToApi(distributed),
      rewardPointsGranted,
      eventCount: claimed.length,
      alreadyExecuted: false,
    };
  }
}
