import { latestClosedPeriod, periodEndingAt } from './period';

/**
 * Bornes de la semaine de commissions (D-009) : vendredi 23:59 heure de Tunis = 22:59 UTC,
 * toute l'année (UTC+1 sans changement d'heure). Intervalle `[start, end)`.
 */

describe('latestClosedPeriod', () => {
  it('un samedi : la clôture est le vendredi de la veille, 22:59 UTC', () => {
    // Samedi 18 juillet 2026, 10:00 UTC.
    const period = latestClosedPeriod(new Date('2026-07-18T10:00:00.000Z'));
    expect(period.end.toISOString()).toBe('2026-07-17T22:59:00.000Z');
    expect(period.start.toISOString()).toBe('2026-07-10T22:59:00.000Z');
  });

  it('un vendredi AVANT 22:59 UTC : la semaine en cours n’est pas close', () => {
    const period = latestClosedPeriod(new Date('2026-07-17T20:00:00.000Z'));
    expect(period.end.toISOString()).toBe('2026-07-10T22:59:00.000Z');
  });

  it('le vendredi à 22:59:00.000 UTC pile (l’instant du cron) : la semaine EST close', () => {
    const period = latestClosedPeriod(new Date('2026-07-17T22:59:00.000Z'));
    expect(period.end.toISOString()).toBe('2026-07-17T22:59:00.000Z');
  });

  it('une milliseconde avant la clôture : toujours la semaine précédente', () => {
    const period = latestClosedPeriod(new Date('2026-07-17T22:58:59.999Z'));
    expect(period.end.toISOString()).toBe('2026-07-10T22:59:00.000Z');
  });

  it('traverse les mois et les années sans dériver', () => {
    // Jeudi 1er janvier 2026 → dernier vendredi : 26 décembre 2025.
    const period = latestClosedPeriod(new Date('2026-01-01T00:00:00.000Z'));
    expect(period.end.toISOString()).toBe('2025-12-26T22:59:00.000Z');
  });
});

describe('periodEndingAt', () => {
  it('début = fin − 7 jours exactement', () => {
    const period = periodEndingAt(new Date('2026-07-17T22:59:00.000Z'));
    expect(period.start.toISOString()).toBe('2026-07-10T22:59:00.000Z');
  });
});
