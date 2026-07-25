import {
  latestClosedPeriod,
  nextClosingAt,
  periodEndingAt,
  tunisDayStart,
  WEEKLY_RUN_CRON,
} from './period';

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

/**
 * `nextClosingAt` alimente le « prochain run » du tableau de bord (§7.2.1). Il doit dire la même
 * chose que le cron : l'expression est partagée, mais c'est la DATE calculée que l'admin lit.
 */
describe('nextClosingAt', () => {
  it('un mardi : la clôture à venir est le vendredi suivant, 22:59 UTC', () => {
    // Mardi 21 juillet 2026.
    expect(nextClosingAt(new Date('2026-07-21T09:00:00.000Z')).toISOString()).toBe(
      '2026-07-24T22:59:00.000Z',
    );
  });

  it('À la clôture PILE, la prochaine est dans sept jours — pas « maintenant »', () => {
    // Le run vient de partir : annoncer la clôture du jour serait faux.
    expect(nextClosingAt(new Date('2026-07-24T22:59:00.000Z')).toISOString()).toBe(
      '2026-07-31T22:59:00.000Z',
    );
  });

  it('une milliseconde AVANT la clôture : c’est encore celle du jour', () => {
    expect(
      nextClosingAt(new Date('2026-07-24T22:58:59.999Z')).toISOString(),
    ).toBe('2026-07-24T22:59:00.000Z');
  });

  it('l’expression cron partagée est bien celle de D-009 (vendredi 23:59)', () => {
    expect(WEEKLY_RUN_CRON).toBe('59 23 * * 5');
  });
});

/**
 * `tunisDayStart` borne les compteurs « du jour ». Le piège est l'heure creuse : entre 00:00 et
 * 01:00 heure de Tunis, on est encore la veille en UTC.
 */
describe('tunisDayStart', () => {
  it('minuit à Tunis = 23:00 UTC la veille', () => {
    expect(tunisDayStart(new Date('2026-07-25T10:00:00.000Z')).toISOString()).toBe(
      '2026-07-24T23:00:00.000Z',
    );
  });

  it('00:30 heure de Tunis (23:30 UTC) appartient au jour tunisien qui COMMENCE, pas à la veille', () => {
    // 23:30 UTC le 24 = 00:30 le 25 à Tunis → le jour commence à 23:00 UTC le 24.
    expect(tunisDayStart(new Date('2026-07-24T23:30:00.000Z')).toISOString()).toBe(
      '2026-07-24T23:00:00.000Z',
    );
  });

  it('22:00 UTC (23:00 à Tunis) est encore le même jour tunisien', () => {
    expect(tunisDayStart(new Date('2026-07-24T22:00:00.000Z')).toISOString()).toBe(
      '2026-07-23T23:00:00.000Z',
    );
  });
});
