import {
  computeBalances,
  computeStartupBonusConsumption,
  REWARD_POINT_EVERY,
} from './balance-math';

/**
 * Maths d'équilibre PURES (temps 1, D-035) : cycles, compteur à vie, règle du 6e (D-032),
 * consommation du bonus (D-031). Tout en POINTS — aucun dinar ici (D-028).
 */

describe('computeBalances — équilibres et compteur à vie', () => {
  it('équilibre simple : 1000/1000 au palier 1000 → 1 cycle, tout consommé', () => {
    const out = computeBalances({
      poolLeft: 1000,
      poolRight: 1000,
      tierBv: 1000,
      lifetimeBalanceCount: 0,
    });
    expect(out.slots).toEqual([{ index: 1, isRewardPoint: false }]);
    expect(out.consumedLeft).toBe(1000);
    expect(out.consumedRight).toBe(1000);
    expect(out.lifetimeBalanceCount).toBe(1);
  });

  it('carry-over : 3000/2000 → 2 cycles, 1000 restants à gauche (non consommés)', () => {
    const out = computeBalances({
      poolLeft: 3000,
      poolRight: 2000,
      tierBv: 1000,
      lifetimeBalanceCount: 0,
    });
    expect(out.slots.map((s) => s.index)).toEqual([1, 2]);
    expect(out.consumedLeft).toBe(2000); // 1000 restent en pool → le carry-over
    expect(out.consumedRight).toBe(2000);
    expect(out.lifetimeBalanceCount).toBe(2);
  });

  it('sous le palier : 900/900 au palier 1000 → aucun cycle, rien de consommé', () => {
    const out = computeBalances({
      poolLeft: 900,
      poolRight: 900,
      tierBv: 1000,
      lifetimeBalanceCount: 4,
    });
    expect(out.slots).toEqual([]);
    expect(out.consumedLeft).toBe(0);
    expect(out.consumedRight).toBe(0);
    expect(out.lifetimeBalanceCount).toBe(4);
  });

  it('règle du 6e (D-032) : le 6e équilibre à vie est un REWARD_POINT, le 7e repaie', () => {
    // Compteur à 5 : deux cycles arrivent → indexes 6 (reward) et 7 (payé).
    const out = computeBalances({
      poolLeft: 2000,
      poolRight: 2000,
      tierBv: 1000,
      lifetimeBalanceCount: 5,
    });
    expect(out.slots).toEqual([
      { index: 6, isRewardPoint: true },
      { index: 7, isRewardPoint: false },
    ]);
    expect(out.lifetimeBalanceCount).toBe(7);
  });

  it('le 12e redonne un Point Fidélité (multiples de 6, à vie, jamais remis à zéro)', () => {
    const out = computeBalances({
      poolLeft: 1000,
      poolRight: 1000,
      tierBv: 1000,
      lifetimeBalanceCount: 11,
    });
    expect(out.slots).toEqual([
      { index: 12, isRewardPoint: true },
    ]);
    expect(REWARD_POINT_EVERY).toBe(6);
  });

  it('palier nul ou négatif (donnée corrompue) → aucun cycle plutôt qu’une division folle', () => {
    const out = computeBalances({
      poolLeft: 5000,
      poolRight: 5000,
      tierBv: 0,
      lifetimeBalanceCount: 0,
    });
    expect(out.slots).toEqual([]);
  });
});

describe('computeStartupBonusConsumption — bonus D-031', () => {
  it('2 activations du même côté : consomme un palier sur la jambe forte, rien en face', () => {
    expect(
      computeStartupBonusConsumption({
        poolLeft: 2000,
        poolRight: 0,
        tierBv: 1000,
      }),
    ).toEqual({ consumedLeft: 1000, consumedRight: 0 });
  });

  it('pools plus petites que le palier (packs des filleuls < palier de l’ancêtre) : borné aux pools', () => {
    expect(
      computeStartupBonusConsumption({
        poolLeft: 1000,
        poolRight: 1000,
        tierBv: 4000,
      }),
    ).toEqual({ consumedLeft: 1000, consumedRight: 1000 });
  });
});
