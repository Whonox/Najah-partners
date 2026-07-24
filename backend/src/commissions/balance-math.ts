/**
 * Cœur PUR du temps 1 (D-035) : décider, pour UN ancêtre, ce que produit l'arrivée de
 * nouveaux points dans sa pool appariable — équilibres, Points Fidélité, bonus de démarrage.
 *
 * Tout est en POINTS et en COMPTEURS : aucune monnaie ici (D-028) — les montants en dinars
 * sont attachés aux événements par l'appelant, depuis le snapshot d'activation de l'ancêtre.
 * Fonctions pures : testables sans base, sans horloge.
 */

/** Chaque 6e équilibre à vie (6, 12, 18…) donne un Point Fidélité au lieu de dinars (D-032). */
export const REWARD_POINT_EVERY = 6;

/** Un équilibre décidé : son n° à vie, et s'il tombe sur un multiple de 6 (D-032). */
export interface BalanceSlot {
  /** N° d'équilibre À VIE (jamais remis à zéro), bonus inclus (D-031, D-032). */
  index: number;
  /** true → événement REWARD_POINT (0 DT, +1 Point Fidélité) au lieu de BALANCE. */
  isRewardPoint: boolean;
}

export interface BalanceOutcome {
  /** Équilibres complétés par cette arrivée de points, en ordre chronologique. */
  slots: BalanceSlot[];
  /** Points consommés sur chaque jambe (= slots.length × palier). */
  consumedLeft: number;
  consumedRight: number;
  /** Compteur à vie APRÈS ces équilibres. */
  lifetimeBalanceCount: number;
}

/**
 * Équilibres complétés : `floor(min(poolG, poolD) / palier)` cycles, chacun consommant le
 * palier sur CHAQUE jambe (spec §6.3). Le reste des pools est le carry-over — il ne bouge
 * pas, il attend la suite (D-033 : les points non appariés sont reportés, jamais perdus).
 */
export function computeBalances(input: {
  poolLeft: number;
  poolRight: number;
  tierBv: number;
  lifetimeBalanceCount: number;
}): BalanceOutcome {
  const { poolLeft, poolRight, tierBv, lifetimeBalanceCount } = input;
  const cycles =
    tierBv > 0 ? Math.floor(Math.min(poolLeft, poolRight) / tierBv) : 0;

  const slots: BalanceSlot[] = [];
  for (let i = 1; i <= cycles; i += 1) {
    const index = lifetimeBalanceCount + i;
    slots.push({ index, isRewardPoint: index % REWARD_POINT_EVERY === 0 });
  }

  return {
    slots,
    consumedLeft: cycles * tierBv,
    consumedRight: cycles * tierBv,
    lifetimeBalanceCount: lifetimeBalanceCount + cycles,
  };
}

/**
 * Bonus de démarrage (D-031) : consommation « comme un équilibre normal » — jusqu'à un
 * palier sur CHAQUE jambe, borné par ce que chaque pool contient réellement (les 2 membres
 * activés peuvent être du même côté, ou porter moins de points que le palier de l'ancêtre).
 * Le déclenchement (exactement 2 membres activés dans le sous-arbre, jamais reçu, pas
 * d'équilibre naturel sur la même activation) appartient à l'appelant.
 */
export function computeStartupBonusConsumption(input: {
  poolLeft: number;
  poolRight: number;
  tierBv: number;
}): { consumedLeft: number; consumedRight: number } {
  return {
    consumedLeft: Math.min(input.tierBv, input.poolLeft),
    consumedRight: Math.min(input.tierBv, input.poolRight),
  };
}
