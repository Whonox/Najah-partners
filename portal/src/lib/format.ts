/**
 * Formatage des DEUX dimensions du modèle (D-028), qui ne se croisent JAMAIS :
 *   — les DINARS (DT), argent, toujours à 3 décimales (le millime) ;
 *   — les POINTS (BV), entiers, sans valeur monétaire.
 *
 * Les montants arrivent de l'API en CHAÎNE (`Prisma.Decimal#toJSON`) : c'est ainsi que la
 * précision au millime survit au transport. On ne les convertit JAMAIS en `number` — un
 * flottant peut rendre 2100.005 en 2100.004999… et un back-office qui affiche un montant faux
 * est pire qu'un back-office qui n'affiche rien. Tout le formatage ci-dessous est donc du
 * découpage de chaîne, pas de l'arithmétique.
 */

const DT_DECIMALS = 3
/** Espace fine insécable : séparateur de milliers du français, jamais coupé en fin de ligne. */
const GROUP_SEPARATOR = " "
const DECIMAL_SEPARATOR = ","
const NUMERIC = /^-?\d+(\.\d+)?$/
/** Ce qu'on affiche quand la valeur n'existe pas. Un tiret cadratin, jamais une case vide. */
export const ABSENT = "—"

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR)
}

/**
 * Ces deux fonctions sont l'ENTONNOIR de tout l'affichage chiffré du back-office : chaque
 * montant et chaque point y passent. Une exception ici ne casse pas une cellule, elle démonte
 * l'arbre React tout entier — sidebar comprise. C'est exactement ce qui arrivait sur les
 * fiches dont le snapshot d'activation ne portait pas de montant en dinars : `undefined.trim()`
 * → écran blanc.
 *
 * Elles ne LÈVENT donc jamais. Une valeur absente rend « — » : l'admin lit « cette donnée
 * n'existe pas », ce qui est vrai, plutôt que rien du tout.
 */
function normalize(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : null
  }
  if (typeof value !== "string") return null
  const raw = value.trim()
  return raw === "" ? null : raw
}

/**
 * Montant en DINARS, toujours à 3 décimales : « 2 100,000 », « -49,900 ».
 * Une valeur illisible est rendue telle quelle plutôt que déformée.
 */
export function formatDt(value: string | number | null | undefined): string {
  const raw = normalize(value)
  if (raw === null) return ABSENT
  if (!NUMERIC.test(raw)) return raw

  const negative = raw.startsWith("-")
  const [integer, fraction = ""] = raw.replace("-", "").split(".")
  const decimals = fraction.padEnd(DT_DECIMALS, "0").slice(0, DT_DECIMALS)

  return `${negative ? "-" : ""}${groupThousands(integer)}${DECIMAL_SEPARATOR}${decimals}`
}

/**
 * Points (BV) — ENTIERS : « 1 000 ». Aucune décimale n'est jamais affichée sur un point ;
 * c'est la première chose qui distingue un point d'un dinar à l'écran.
 */
export function formatPoints(value: string | number | null | undefined): string {
  const raw = normalize(value)
  if (raw === null) return ABSENT
  if (!NUMERIC.test(raw)) return raw

  const negative = raw.startsWith("-")
  const [integer] = raw.replace("-", "").split(".")

  return `${negative ? "-" : ""}${groupThousands(integer)}`
}

/** Date lisible en français (fuseau du navigateur) : « 24/07/2026 15:30 ». */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return ABSENT
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}
