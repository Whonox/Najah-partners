import { CommissionEventType } from '@prisma/client';
import { Money, ZERO_DT } from '../common/money';

/**
 * Cœur PUR du temps 2 (D-035) : appliquer le plafond hebdomadaire d'UN membre sur ses
 * événements de la période, EN CHRONOLOGIE (D-033 : occurredAt croissant, puis id — les
 * événements d'une même activation partagent leur horodatage et sont départagés par l'ordre
 * d'insertion, DIRECT avant BALANCE).
 *
 * Règles (D-032, D-033) :
 *  - le cumul s'additionne au fil de l'eau ; on paie jusqu'au plafond, l'excédent est PERDU
 *    (jamais reporté) — l'événement qui franchit le plafond est payé PARTIELLEMENT ;
 *  - un événement inéligible (gelé / INSCRIT au moment de l'événement, D-034) ne compte ni
 *    au cumul ni au versement : il ne sera JAMAIS payé ;
 *  - un REWARD_POINT vaut 0 DT : il accorde 1 Point Fidélité SI le plafond n'est pas encore
 *    atteint à son instant ; sinon le point est perdu (le compteur à vie, lui, a déjà été
 *    incrémenté au temps 1 — seul le Point Fidélité se perd).
 */

export interface SettleableEvent {
  id: number;
  type: CommissionEventType;
  amountDt: Money;
  eligible: boolean;
  occurredAt: Date;
}

/**
 * Le sort d'UN événement dans le règlement de la semaine — ce que le back-office doit pouvoir
 * montrer pour qu'un admin explique un montant à un affilié (§7.2.7).
 *
 * Cette ventilation n'est PAS stockée en base : `Commission` n'en garde que l'agrégat
 * (`grossDt`, `paidDt`) et `CommissionEvent.paid` qu'un booléen. Elle est donc RECALCULÉE pour
 * l'affichage — mais par CETTE fonction, celle-là même qui a réglé le run. Une seconde
 * implémentation « juste pour l'écran » finirait par expliquer autrement que ce qui a été payé.
 */
export interface SettlementLine {
  eventId: number;
  /** Cumul éligible AVANT cet événement (DINARS) — c'est lui qui décide du plafond. */
  cumulativeBeforeDt: Money;
  /** Cumul éligible APRÈS cet événement. */
  cumulativeAfterDt: Money;
  /** Part réellement versée par cet événement (0 s'il est arrivé après le plafond). */
  paidDt: Money;
  /** Part PERDUE au plafond (jamais reportée — D-033). */
  lostDt: Money;
  /** L'événement franchit le plafond : il est payé PARTIELLEMENT. */
  crossesCap: boolean;
  rewardPointGranted: boolean;
  rewardPointLost: boolean;
}

export interface WeekSettlement {
  /** Total éligible avant plafond (DINARS). */
  grossDt: Money;
  /** Versé : min(gross, plafond) — l'écart est perdu (D-033). */
  paidDt: Money;
  /** Événements ayant contribué au versement (même partiellement) ou au Point Fidélité. */
  paidEventIds: number[];
  rewardPointsGranted: number;
  rewardPointsLost: number;
  /** Nombre d'événements éligibles examinés. */
  eligibleCount: number;
  /**
   * Une ligne par événement examiné, dans l'ORDRE CHRONOLOGIQUE d'application du plafond. Un
   * événement inéligible y figure avec des montants nuls : il a existé, il n'a rien payé.
   */
  lines: SettlementLine[];
}

export function settleWeek(
  events: SettleableEvent[],
  capDt: Money,
): WeekSettlement {
  const ordered = [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id - b.id,
  );

  let gross = ZERO_DT;
  let paid = ZERO_DT;
  const paidEventIds: number[] = [];
  let rewardPointsGranted = 0;
  let rewardPointsLost = 0;
  let eligibleCount = 0;
  const lines: SettlementLine[] = [];

  for (const event of ordered) {
    if (!event.eligible) {
      // Tracé, jamais payé (D-034). La ligne existe pour que l'écran puisse le DIRE — une
      // absence se lirait comme un oubli.
      lines.push(emptyLine(event.id, gross));
      continue;
    }
    eligibleCount += 1;

    if (event.type === CommissionEventType.REWARD_POINT) {
      // 0 DT : le cumul ne bouge pas. Accordé seulement sous le plafond (D-032).
      const granted = gross.lessThan(capDt);
      if (granted) {
        rewardPointsGranted += 1;
        paidEventIds.push(event.id);
      } else {
        rewardPointsLost += 1;
      }
      lines.push({
        ...emptyLine(event.id, gross),
        rewardPointGranted: granted,
        rewardPointLost: !granted,
      });
      continue;
    }

    const paidBefore = minDt(gross, capDt);
    const cumulativeBefore = gross;
    gross = gross.plus(event.amountDt);
    const paidAfter = minDt(gross, capDt);
    const share = paidAfter.minus(paidBefore);
    if (share.greaterThan(0)) {
      paid = paid.plus(share);
      paidEventIds.push(event.id);
    }
    const lost = event.amountDt.minus(share);
    lines.push({
      eventId: event.id,
      cumulativeBeforeDt: cumulativeBefore,
      cumulativeAfterDt: gross,
      paidDt: share,
      lostDt: lost,
      // Franchissement : une part payée ET une part perdue sur le MÊME événement.
      crossesCap: share.greaterThan(0) && lost.greaterThan(0),
      rewardPointGranted: false,
      rewardPointLost: false,
    });
  }

  return {
    grossDt: gross,
    paidDt: paid,
    paidEventIds,
    rewardPointsGranted,
    rewardPointsLost,
    eligibleCount,
    lines,
  };
}

/** Ligne sans effet monétaire (inéligible, ou Point Fidélité qui ne vaut aucun dinar). */
function emptyLine(eventId: number, cumulative: Money): SettlementLine {
  return {
    eventId,
    cumulativeBeforeDt: cumulative,
    cumulativeAfterDt: cumulative,
    paidDt: ZERO_DT,
    lostDt: ZERO_DT,
    crossesCap: false,
    rewardPointGranted: false,
    rewardPointLost: false,
  };
}

function minDt(a: Money, b: Money): Money {
  return a.lessThan(b) ? a : b;
}
