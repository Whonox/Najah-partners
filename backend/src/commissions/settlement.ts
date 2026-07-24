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

  for (const event of ordered) {
    if (!event.eligible) {
      continue;
    }
    eligibleCount += 1;

    if (event.type === CommissionEventType.REWARD_POINT) {
      // 0 DT : le cumul ne bouge pas. Accordé seulement sous le plafond (D-032).
      if (gross.lessThan(capDt)) {
        rewardPointsGranted += 1;
        paidEventIds.push(event.id);
      } else {
        rewardPointsLost += 1;
      }
      continue;
    }

    const paidBefore = minDt(gross, capDt);
    gross = gross.plus(event.amountDt);
    const paidAfter = minDt(gross, capDt);
    const share = paidAfter.minus(paidBefore);
    if (share.greaterThan(0)) {
      paid = paid.plus(share);
      paidEventIds.push(event.id);
    }
  }

  return {
    grossDt: gross,
    paidDt: paid,
    paidEventIds,
    rewardPointsGranted,
    rewardPointsLost,
    eligibleCount,
  };
}

function minDt(a: Money, b: Money): Money {
  return a.lessThan(b) ? a : b;
}
