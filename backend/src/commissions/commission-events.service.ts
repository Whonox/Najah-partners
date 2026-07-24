import { Injectable } from '@nestjs/common';
import { CommissionEventType, MemberStatus, Prisma } from '@prisma/client';
import { money } from '../common/money';
import type { ActivationSnapshot } from '../members/members.types';
import type { PropagatedAncestor } from '../members/placement.service';
import {
  computeBalances,
  computeStartupBonusConsumption,
} from './balance-math';
import {
  CorruptActivationSnapshotError,
  EventConsumptionMismatchError,
} from './commissions.errors';

/**
 * TEMPS 1 du moteur (D-035) : écrire les événements de commission AU FIL DE L'EAU, dans la
 * transaction de l'activation, pendant que la chaîne d'ancêtres est encore verrouillée
 * (D-024). Rien n'est payé ici — le run hebdomadaire (temps 2) appliquera le plafond et
 * créditera. Mais TOUT est décidé ici : montants figés (snapshot), éligibilité au moment
 * de l'événement (D-034), consommation immédiate des points appariés, compteur d'équilibres
 * à vie, bonus de démarrage (D-031), Points Fidélité (D-032).
 *
 * Chronologie (D-033) : tous les événements d'une activation partagent `occurredAt` (le
 * timestamp de la transaction) ; leur ordre fin est porté par l'`id` — le DIRECT est inséré
 * AVANT les équilibres, et les équilibres du plus proche ancêtre avant les plus lointains.
 */

export interface ActivationEventsInput {
  /** Le membre qui vient d'être activé — la source de tous les événements. */
  sourceMemberId: number;
  /** Son snapshot d'activation : fige `directCommissionDt` (le pack du filleul, spec §6.2). */
  sourceSnapshot: ActivationSnapshot;
  /** Sponsor (commission directe) — null pour un compte sans parrain (racine, seed). */
  sponsor: { id: number; status: MemberStatus } | null;
  /** Les ancêtres de placement tels que la propagation les a laissés, du plus proche à la racine. */
  ancestors: PropagatedAncestor[];
}

export interface ActivationEventsSummary {
  direct: number;
  balance: number;
  startupBonus: number;
  rewardPoint: number;
}

/** Mutation à appliquer à un ancêtre : consommation de points + compteurs (D-031, D-032). */
interface AncestorMutation {
  id: number;
  consumeLeft: number;
  consumeRight: number;
  newLifetimeCount: number;
  bonusUsed: boolean;
}

@Injectable()
export class CommissionEventsService {
  /**
   * À appeler UNIQUEMENT depuis `ActivationService.activateInTx`, après la propagation :
   * les `ancestors` sortent de son RETURNING, donc reflètent l'état SOUS VERROU — la
   * détection d'équilibre et la consommation sont sérialisées entre activations concurrentes.
   */
  async recordActivationEventsInTx(
    tx: Prisma.TransactionClient,
    input: ActivationEventsInput,
  ): Promise<ActivationEventsSummary> {
    const events: Prisma.CommissionEventCreateManyInput[] = [];
    const mutations: AncestorMutation[] = [];
    const summary: ActivationEventsSummary = {
      direct: 0,
      balance: 0,
      startupBonus: 0,
      rewardPoint: 0,
    };

    // ── 1. DIRECT, écrit AVANT tout équilibre (D-033) ──────────────────────────────────
    // Montant : la commission directe du pack DU FILLEUL (spec §6.2), figée dans SON
    // snapshot. Éligibilité AU MOMENT de l'événement (D-034) : un sponsor gelé — ou encore
    // INSCRIT (§10 : ignoré du run) — voit l'événement tracé mais jamais payé.
    if (input.sponsor) {
      events.push({
        memberId: input.sponsor.id,
        type: CommissionEventType.DIRECT,
        amountDt: money(input.sourceSnapshot.directCommissionDt),
        sourceMemberId: input.sourceMemberId,
        eligible: input.sponsor.status === MemberStatus.ACTIVE,
        snapshot: {
          basis: 'SOURCE_PACK',
          packName: input.sourceSnapshot.packName,
          directCommissionDt: input.sourceSnapshot.directCommissionDt,
        },
        balanceIndex: null,
      });
      summary.direct += 1;
    }

    // ── 2. Équilibres et bonus, ancêtre par ancêtre, du plus proche à la racine ────────
    for (const ancestor of input.ancestors) {
      // Un ancêtre non-ACTIF n'a rien reçu dans sa pool (la propagation ne crédite que les
      // ACTIFS) : aucun équilibre possible, aucun événement — les points ont simplement
      // TRAVERSÉ (D-034) ou attendent sa propre activation (baseline, D-013).
      if (ancestor.status !== MemberStatus.ACTIVE) {
        continue;
      }
      const snapshot = this.readSnapshot(ancestor);
      const tierBv = ancestor.activationTierBv;
      if (tierBv === null || tierBv <= 0) {
        throw new CorruptActivationSnapshotError(ancestor.id);
      }

      const outcome = computeBalances({
        poolLeft: ancestor.carriedLeftPoints,
        poolRight: ancestor.carriedRightPoints,
        tierBv,
        lifetimeBalanceCount: ancestor.lifetimeBalanceCount,
      });

      if (outcome.slots.length > 0) {
        for (const slot of outcome.slots) {
          events.push({
            memberId: ancestor.id,
            type: slot.isRewardPoint
              ? CommissionEventType.REWARD_POINT
              : CommissionEventType.BALANCE,
            // Chaque 6e équilibre à vie ne paie AUCUN dinar : il vaut 1 Point Fidélité,
            // attribué au run s'il tombe sous le plafond (D-032).
            amountDt: slot.isRewardPoint
              ? money(0)
              : money(snapshot.indirectCommissionDt),
            sourceMemberId: input.sourceMemberId,
            eligible: true, // l'ancêtre est ACTIF — évalué à l'instant de l'événement (D-034)
            snapshot: {
              packName: snapshot.packName,
              tierBv,
              indirectCommissionDt: snapshot.indirectCommissionDt,
              weeklyCapDt: snapshot.weeklyCapDt,
            },
            balanceIndex: slot.index,
          });
          if (slot.isRewardPoint) {
            summary.rewardPoint += 1;
          } else {
            summary.balance += 1;
          }
        }
        mutations.push({
          id: ancestor.id,
          consumeLeft: outcome.consumedLeft,
          consumeRight: outcome.consumedRight,
          newLifetimeCount: outcome.lifetimeBalanceCount,
          bonusUsed: false,
        });
        continue;
      }

      // Bonus de démarrage (D-031) : à l'activation qui porte le sous-arbre à EXACTEMENT
      // 2 membres activés — si cette même activation n'a pas déjà produit un équilibre
      // naturel (le membre a alors déjà perçu SA commission indirecte : le jalon est payé,
      // le bonus ne s'y empile pas). Une seule fois à vie ; compte comme l'équilibre n°1.
      if (
        ancestor.activatedDescendants === 2 &&
        !ancestor.startupBonusUsed &&
        ancestor.lifetimeBalanceCount === 0
      ) {
        const consumption = computeStartupBonusConsumption({
          poolLeft: ancestor.carriedLeftPoints,
          poolRight: ancestor.carriedRightPoints,
          tierBv,
        });
        events.push({
          memberId: ancestor.id,
          type: CommissionEventType.STARTUP_BONUS,
          amountDt: money(snapshot.indirectCommissionDt),
          sourceMemberId: input.sourceMemberId,
          eligible: true,
          snapshot: {
            packName: snapshot.packName,
            tierBv,
            indirectCommissionDt: snapshot.indirectCommissionDt,
            weeklyCapDt: snapshot.weeklyCapDt,
            consumedLeft: consumption.consumedLeft,
            consumedRight: consumption.consumedRight,
          },
          balanceIndex: 1, // le bonus EST l'équilibre n°1 (D-031)
        });
        summary.startupBonus += 1;
        mutations.push({
          id: ancestor.id,
          consumeLeft: consumption.consumedLeft,
          consumeRight: consumption.consumedRight,
          newLifetimeCount: 1,
          bonusUsed: true,
        });
      }
    }

    // ── 3. Persistance — un INSERT multi-lignes (l'ordre du tableau fait l'ordre des ids,
    //       donc la chronologie fine D-033), puis UNE mise à jour ensembliste des ancêtres.
    if (events.length > 0) {
      await tx.commissionEvent.createMany({ data: events });
    }
    if (mutations.length > 0) {
      await this.applyMutationsInTx(tx, mutations);
    }
    return summary;
  }

  /**
   * Consommation des points appariés + compteurs, en UNE instruction (les lignes sont déjà
   * verrouillées par la chaîne d'activation — D-024). `computeBalances` garantit qu'aucune
   * pool ne devient négative : la consommation est bornée par les pools relues sous verrou.
   */
  private async applyMutationsInTx(
    tx: Prisma.TransactionClient,
    mutations: AncestorMutation[],
  ): Promise<void> {
    const ids = mutations.map((m) => m.id);
    const consumeLeft = mutations.map((m) => m.consumeLeft);
    const consumeRight = mutations.map((m) => m.consumeRight);
    const newCounts = mutations.map((m) => m.newLifetimeCount);
    const bonusUsed = mutations.map((m) => m.bonusUsed);

    const rows = await tx.$queryRaw<Array<{ id: number }>>`
      UPDATE "Member" m
      SET "carriedLeftPoints"    = m."carriedLeftPoints"  - u.consume_left,
          "carriedRightPoints"   = m."carriedRightPoints" - u.consume_right,
          "lifetimeBalanceCount" = u.new_count,
          "startupBonusUsed"     = m."startupBonusUsed" OR u.bonus_used,
          "updatedAt"            = now()
      FROM (
        SELECT *
        FROM unnest(
          ${ids}::int[],
          ${consumeLeft}::int[],
          ${consumeRight}::int[],
          ${newCounts}::int[],
          ${bonusUsed}::boolean[]
        ) AS t(id, consume_left, consume_right, new_count, bonus_used)
      ) u
      WHERE m."id" = u.id
      RETURNING m."id"
    `;

    if (rows.length !== mutations.length) {
      throw new EventConsumptionMismatchError(rows.length, mutations.length);
    }
  }

  /** Le snapshot d'activation d'un ancêtre ACTIF doit être lisible — sinon, corruption. */
  private readSnapshot(ancestor: PropagatedAncestor): ActivationSnapshot {
    const snapshot = ancestor.activationSnapshot as ActivationSnapshot | null;
    if (
      !snapshot ||
      typeof snapshot.indirectCommissionDt !== 'string' ||
      typeof snapshot.weeklyCapDt !== 'string'
    ) {
      throw new CorruptActivationSnapshotError(ancestor.id);
    }
    return snapshot;
  }
}
