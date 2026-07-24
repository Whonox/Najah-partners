/**
 * Bornes de la semaine de commissions (D-009) : clôture le VENDREDI à 23:59, heure de Tunis.
 * Tunis est à UTC+1 SANS changement d'heure — la clôture est donc l'instant UTC fixe
 * « vendredi 22:59:00.000 » : les bornes se calculent en arithmétique UTC pure, sans
 * bibliothèque de fuseaux, et sont déterministes toute l'année.
 *
 * Convention d'intervalle : `[start, end)` — un événement daté exactement de la clôture
 * appartient à la semaine SUIVANTE (le run réclame `occurredAt < end`).
 */

/** Vendredi, en convention `Date.getUTCDay()` (0 = dimanche). */
const FRIDAY = 5;
/** 23:59 à Tunis (UTC+1) = 22:59 UTC. */
const CUTOFF_UTC_HOURS = 22;
const CUTOFF_UTC_MINUTES = 59;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface RunPeriod {
  /** Début inclus : le vendredi 23:59 Tunis précédent. */
  start: Date;
  /** Fin EXCLUE : le vendredi 23:59 Tunis de clôture. */
  end: Date;
}

/** La période d'une semaine se terminant à `end` (qui doit être une clôture valide). */
export function periodEndingAt(end: Date): RunPeriod {
  return { start: new Date(end.getTime() - WEEK_MS), end };
}

/**
 * La dernière clôture ATTEINTE à l'instant `now` (bord inclus : à 23:59:00.000 pile, la
 * semaine est close — c'est l'instant où le cron se déclenche).
 */
export function latestClosedPeriod(now: Date): RunPeriod {
  const candidate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      CUTOFF_UTC_HOURS,
      CUTOFF_UTC_MINUTES,
      0,
      0,
    ),
  );
  while (candidate.getUTCDay() !== FRIDAY || candidate.getTime() > now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() - 1);
  }
  return periodEndingAt(candidate);
}
