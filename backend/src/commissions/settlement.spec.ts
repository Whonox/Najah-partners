import { CommissionEventType } from '@prisma/client';
import { money } from '../common/money';
import { SettleableEvent, settleWeek } from './settlement';

/**
 * Application du plafond (temps 2, D-035) : chronologie stricte (D-033), excédent PERDU,
 * paiement partiel de l'événement qui franchit le plafond, Points Fidélité accordés sous le
 * plafond et perdus au-delà (D-032), inéligibles ignorés (D-034).
 */

let nextId = 1;
function event(
  type: CommissionEventType,
  amount: string,
  at: string,
  overrides: Partial<SettleableEvent> = {},
): SettleableEvent {
  return {
    id: nextId++,
    type,
    amountDt: money(amount),
    occurredAt: new Date(at),
    eligible: true,
    ...overrides,
  };
}

beforeEach(() => {
  nextId = 1;
});

describe('settleWeek — plafond hebdomadaire', () => {
  it('sous le plafond : tout est payé, rien de perdu', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.DIRECT, '500', '2026-07-13T10:00:00Z'),
        event(CommissionEventType.BALANCE, '250', '2026-07-14T10:00:00Z'),
      ],
      money(10000),
    );
    expect(result.grossDt.toString()).toBe('750');
    expect(result.paidDt.toString()).toBe('750');
    expect(result.paidEventIds).toEqual([1, 2]);
  });

  it('franchissement : payé jusqu’au plafond, l’événement à cheval est payé PARTIELLEMENT, le reste PERDU', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.DIRECT, '700', '2026-07-13T10:00:00Z'),
        event(CommissionEventType.BALANCE, '400', '2026-07-14T10:00:00Z'), // franchit à 1000
        event(CommissionEventType.BALANCE, '400', '2026-07-15T10:00:00Z'), // entièrement perdu
      ],
      money(1000),
    );
    expect(result.grossDt.toString()).toBe('1500');
    expect(result.paidDt.toString()).toBe('1000'); // jamais plus que le plafond
    expect(result.paidEventIds).toEqual([1, 2]); // le 3e n'a rien touché
  });

  it('la chronologie fait foi : mêmes événements, autre ordre d’arrivée → autres payés (D-033)', () => {
    // Le tri interne suit (occurredAt, id) : l'ordre du tableau d'entrée est indifférent.
    const late = event(CommissionEventType.BALANCE, '800', '2026-07-16T10:00:00Z');
    const early = event(CommissionEventType.DIRECT, '800', '2026-07-12T10:00:00Z');
    const result = settleWeek([late, early], money(1000));
    // early (12/07) passe entière ; late (16/07) n'a que 200 de place.
    expect(result.paidDt.toString()).toBe('1000');
    expect(result.paidEventIds).toEqual([early.id, late.id]);
  });

  it('même occurredAt (même activation) : l’id départage — DIRECT inséré avant BALANCE (D-033)', () => {
    const at = '2026-07-15T12:00:00Z';
    const direct = event(CommissionEventType.DIRECT, '500', at); // id plus petit
    const balance = event(CommissionEventType.BALANCE, '250', at);
    const result = settleWeek([balance, direct], money(600));
    // La directe passe entière (500), l'équilibre n'a que 100 de place.
    expect(result.paidDt.toString()).toBe('600');
    expect(result.paidEventIds).toEqual([direct.id, balance.id]);
  });

  it('inéligible (gelé / INSCRIT au moment de l’événement) : ni cumul, ni paiement — jamais (D-034)', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.DIRECT, '500', '2026-07-13T10:00:00Z', {
          eligible: false,
        }),
        event(CommissionEventType.BALANCE, '250', '2026-07-14T10:00:00Z'),
      ],
      money(10000),
    );
    expect(result.grossDt.toString()).toBe('250'); // la directe gelée n'existe pas pour le cumul
    expect(result.paidDt.toString()).toBe('250');
    expect(result.paidEventIds).toEqual([2]);
    expect(result.eligibleCount).toBe(1);
  });

  it('REWARD_POINT sous le plafond : +1 Point Fidélité, 0 DT (D-032)', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.BALANCE, '250', '2026-07-13T10:00:00Z'),
        event(CommissionEventType.REWARD_POINT, '0', '2026-07-14T10:00:00Z'),
      ],
      money(10000),
    );
    expect(result.paidDt.toString()).toBe('250');
    expect(result.rewardPointsGranted).toBe(1);
    expect(result.rewardPointsLost).toBe(0);
    expect(result.paidEventIds).toEqual([1, 2]);
  });

  it('REWARD_POINT survenu APRÈS le plafond : le Point Fidélité est PERDU (D-032)', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.DIRECT, '1000', '2026-07-13T10:00:00Z'), // atteint le plafond
        event(CommissionEventType.REWARD_POINT, '0', '2026-07-14T10:00:00Z'),
      ],
      money(1000),
    );
    expect(result.paidDt.toString()).toBe('1000');
    expect(result.rewardPointsGranted).toBe(0);
    expect(result.rewardPointsLost).toBe(1);
    expect(result.paidEventIds).toEqual([1]);
  });

  it('REWARD_POINT AVANT que le plafond soit atteint : accordé, même si le plafond tombe ensuite', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.REWARD_POINT, '0', '2026-07-13T10:00:00Z'),
        event(CommissionEventType.DIRECT, '1000', '2026-07-14T10:00:00Z'),
      ],
      money(1000),
    );
    expect(result.rewardPointsGranted).toBe(1);
    expect(result.rewardPointsLost).toBe(0);
  });

  it('montants au millime : aucune dérive flottante', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.DIRECT, '0.100', '2026-07-13T10:00:00Z'),
        event(CommissionEventType.DIRECT, '0.200', '2026-07-14T10:00:00Z'),
      ],
      money('0.250'),
    );
    expect(result.grossDt.toString()).toBe('0.3');
    expect(result.paidDt.toString()).toBe('0.25'); // 0.100 + 0.150 : partiel exact au millime
  });
});

/**
 * Ventilation PAR ÉVÉNEMENT (Tranche 8c) : c'est ce que l'écran de supervision affiche pour
 * expliquer un versement à un affilié (§7.2.7). Elle n'est pas stockée en base — elle est rejouée
 * par cette fonction, donc ces tests garantissent que l'explication dit bien ce qui a été payé.
 */
describe('settleWeek — ventilation par événement (supervision §7.2.7)', () => {
  it('une ligne par événement, dans l’ordre CHRONOLOGIQUE d’application, pas d’entrée reçue', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.BALANCE, '250', '2026-07-15T10:00:00Z'),
        event(CommissionEventType.DIRECT, '500', '2026-07-13T10:00:00Z'),
      ],
      money(10000),
    );
    // Reçus dans l'ordre [BALANCE, DIRECT], rendus dans l'ordre d'application [DIRECT, BALANCE].
    expect(result.lines.map((line) => line.eventId)).toEqual([2, 1]);
    expect(result.lines.map((line) => line.paidDt.toString())).toEqual([
      '500',
      '250',
    ]);
    expect(result.lines.every((line) => line.lostDt.isZero())).toBe(true);
    expect(result.lines.some((line) => line.crossesCap)).toBe(false);
  });

  it('le cumul courant progresse et l’événement à cheval porte À LA FOIS du payé et du perdu', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.DIRECT, '700', '2026-07-13T10:00:00Z'),
        event(CommissionEventType.BALANCE, '400', '2026-07-14T10:00:00Z'),
        event(CommissionEventType.BALANCE, '400', '2026-07-15T10:00:00Z'),
      ],
      money(1000),
    );

    const [first, crossing, beyond] = result.lines;
    expect(first.cumulativeBeforeDt.toString()).toBe('0');
    expect(first.cumulativeAfterDt.toString()).toBe('700');
    expect(first.paidDt.toString()).toBe('700');

    // C'est CETTE ligne qui rend le plafond compréhensible : 300 payés, 100 perdus.
    expect(crossing.paidDt.toString()).toBe('300');
    expect(crossing.lostDt.toString()).toBe('100');
    expect(crossing.crossesCap).toBe(true);

    // Au-delà du plafond : tout est perdu, et ce n'est PAS reporté (D-033).
    expect(beyond.paidDt.toString()).toBe('0');
    expect(beyond.lostDt.toString()).toBe('400');
    expect(beyond.crossesCap).toBe(false);
  });

  it('un événement INÉLIGIBLE a une ligne à zéro qui ne fait pas avancer le cumul (D-034)', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.DIRECT, '500', '2026-07-13T10:00:00Z', {
          eligible: false,
        }),
        event(CommissionEventType.DIRECT, '500', '2026-07-14T10:00:00Z'),
      ],
      money(10000),
    );

    const [ignored, paid] = result.lines;
    expect(ignored.paidDt.isZero()).toBe(true);
    expect(ignored.cumulativeAfterDt.toString()).toBe('0');
    // L'événement suivant démarre bien à 0 : l'inéligible n'a consommé aucun plafond.
    expect(paid.cumulativeBeforeDt.toString()).toBe('0');
    expect(paid.paidDt.toString()).toBe('500');
  });

  it('un REWARD_POINT ne porte aucun dinar et signale s’il est accordé ou PERDU (D-032)', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.REWARD_POINT, '0', '2026-07-13T10:00:00Z'),
        event(CommissionEventType.DIRECT, '1000', '2026-07-14T10:00:00Z'),
        event(CommissionEventType.REWARD_POINT, '0', '2026-07-15T10:00:00Z'),
      ],
      money(1000),
    );

    const [granted, , lost] = result.lines;
    expect(granted.rewardPointGranted).toBe(true);
    expect(granted.paidDt.isZero()).toBe(true);
    expect(lost.rewardPointLost).toBe(true);
    expect(lost.rewardPointGranted).toBe(false);
  });

  it('la somme des lignes payées égale le versement, et celle des perdues l’écart au brut', () => {
    const result = settleWeek(
      [
        event(CommissionEventType.DIRECT, '700', '2026-07-13T10:00:00Z'),
        event(CommissionEventType.BALANCE, '400', '2026-07-14T10:00:00Z'),
        event(CommissionEventType.BALANCE, '400', '2026-07-15T10:00:00Z'),
      ],
      money(1000),
    );

    const sum = (pick: 'paidDt' | 'lostDt') =>
      result.lines
        .reduce((total, line) => total.plus(line[pick]), money(0))
        .toString();

    // Sans cette égalité, l'écran expliquerait un autre versement que celui qui a eu lieu.
    expect(sum('paidDt')).toBe(result.paidDt.toString());
    expect(sum('lostDt')).toBe(result.grossDt.minus(result.paidDt).toString());
  });
});
