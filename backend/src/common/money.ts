import { Prisma } from '@prisma/client';

/**
 * Le DINAR, et rien d'autre (D-028).
 *
 * Tout l'argent du système passe par ici : solde d'un membre, valeur d'une e-card, ligne de
 * grand livre, commission, plafond, prix. Les POINTS (palier d'un pack, valeur BV d'un produit,
 * jambes de l'arbre) ne sont PAS de l'argent et restent des `number` entiers — aucune fonction
 * de ce fichier n'en prend ni n'en rend. C'est la frontière, et elle est étanche : il n'existe
 * aucune conversion points ↔ dinars nulle part dans le projet.
 *
 * Pourquoi `Decimal` et jamais `number` : le dinar tunisien a 3 décimales (le millime), et un
 * `float` binaire ne représente pas 0,1 exactement. Additionner des soldes en flottant finit
 * par produire un centime de trop ou de moins — sur une comptabilité, c'est une corruption.
 */

/** Le millime : 3 décimales, jamais plus. Aligné sur `@db.Decimal(12, 3)`. */
export const MONEY_SCALE = 3;

/** Un montant en dinars. Alias nommé pour que les signatures se lisent. */
export type Money = Prisma.Decimal;

/** Construit un montant. À utiliser partout plutôt que `new Prisma.Decimal(...)` en vrac. */
export function money(value: Prisma.Decimal.Value): Money {
  return new Prisma.Decimal(value);
}

export const ZERO_DT: Money = money(0);

/**
 * Un montant est valide s'il est fini et ne descend pas sous le millime. Un montant à
 * 4 décimales serait tronqué silencieusement par Postgres (`numeric(12,3)` arrondit) : on
 * refuse plutôt que d'écrire un chiffre que l'appelant n'a pas voulu.
 */
export function isValidMoney(value: Money): boolean {
  return value.isFinite() && value.decimalPlaces() <= MONEY_SCALE;
}

/**
 * Lit un montant venu d'une requête SQL brute. Le driver rend `numeric` sous des formes
 * variables (string, Decimal, voire number selon le chemin) ; on passe systématiquement par le
 * texte pour ne JAMAIS traverser un flottant.
 */
export function moneyFromSql(value: string | number | Money): Money {
  return money(typeof value === 'number' ? value.toString() : value);
}

/**
 * Forme d'API : une chaîne à 3 décimales (`"2200.000"`). Pas un `number` — JSON n'a que des
 * flottants, et un solde qui traverse un `double` peut revenir faux au millime près.
 */
export function moneyToApi(value: Money): string {
  return value.toFixed(MONEY_SCALE);
}
