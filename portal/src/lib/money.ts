/**
 * Arithmétique en DINARS côté écran — EN MILLIMES ENTIERS, jamais en flottant.
 *
 * Le portail doit additionner des montants (la somme des e-cards saisies) et la comparer, AU
 * MILLIME, au montant dû : c'est la règle de couverture exacte (D-030). Or `0.1 + 0.2` vaut
 * `0.30000000000000004` en JavaScript — sur cette comparaison-là, un flottant ferait afficher
 * « il vous manque 0,000 DT » sur un paiement pourtant juste, ou l'inverse. On travaille donc
 * en entiers de millimes, obtenus par DÉCOUPAGE DE CHAÎNE (le backend rend déjà des chaînes
 * décimales), et on ne repasse en texte qu'à l'affichage.
 *
 * Ces fonctions ne décident RIEN : le backend reste seul juge de l'acceptation d'un paiement.
 * Elles servent à dire à l'affilié, avant qu'il n'envoie, où il en est.
 */

const SCALE = 3

/**
 * Convertit un montant décimal (chaîne ou nombre) en millimes entiers.
 * Une valeur illisible rend 0 plutôt que `NaN` : un total faux se voit, un `NaN` propagé
 * contamine tout l'écran en « — ».
 */
export function toMillimes(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const raw = String(value).trim().replace(",", ".")
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return 0

  const negative = raw.startsWith("-")
  const [integer, fraction = ""] = raw.replace("-", "").split(".")
  const padded = fraction.padEnd(SCALE, "0").slice(0, SCALE)
  const millimes = Number(integer) * 1000 + Number(padded)
  return negative ? -millimes : millimes
}

/** Repasse des millimes entiers en chaîne décimale à 3 décimales (« 2100.000 »). */
export function fromMillimes(millimes: number): string {
  const negative = millimes < 0
  const absolute = Math.abs(millimes)
  const integer = Math.floor(absolute / 1000)
  const fraction = String(absolute % 1000).padStart(SCALE, "0")
  return `${negative ? "-" : ""}${integer}.${fraction}`
}

/** Somme d'une liste de montants, sans jamais traverser un flottant. */
export function sumMillimes(values: Array<string | number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + toMillimes(value), 0)
}
