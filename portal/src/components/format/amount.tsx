import { cn } from "@/lib/utils"
import { ABSENT, formatDt, formatPoints } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * Les unités du modèle à l'écran (D-028). Elles ne doivent JAMAIS se confondre :
 *   — un DINAR est de l'argent : 3 décimales, aligné à droite, unité « DT » ;
 *   — un POINT est une unité d'arbre : entier, jamais aligné en colonne d'argent, unité « pts »
 *     en petites capitales ;
 *   — un POINT FIDÉLITÉ est une TROISIÈME unité (D-032), ni l'une ni l'autre.
 *
 * C'est encore plus critique ici que dans le back-office : un gestionnaire qui confond deux
 * colonnes se corrige, un affilié qui confond ses points et son argent réclame. D'où trois
 * rendus visuellement distincts plutôt qu'un seul paramétrable.
 *
 * Aucun composant ne formate un montant à la main : il passe par ici.
 */

export function MoneyDt({
  value,
  className,
}: {
  /**
   * Montant tel qu'il vient de l'API : une CHAÎNE décimale (jamais un flottant). `null` /
   * `undefined` sont acceptés — un montant que l'historique n'a jamais enregistré existe
   * (snapshots d'avant D-028) et vaut mieux affiché « — » qu'en écran blanc.
   */
  value: string | number | null | undefined
  className?: string
}) {
  const t = useT()
  const text = formatDt(value)
  const absent = text === ABSENT

  return (
    <span
      data-unit="dt"
      className={cn(
        "inline-flex items-baseline justify-end gap-1 font-medium tabular-nums",
        absent && "text-muted-foreground",
        className,
      )}
    >
      {text}
      {/* Pas d'unité derrière un tiret : « — DT » se lirait comme un montant nul en dinars,
          alors qu'il n'y a AUCUN montant. */}
      {absent ? null : (
        <span className="text-xs font-normal text-muted-foreground">{t("unit.dt")}</span>
      )}
    </span>
  )
}

export function PointsBv({
  value,
  className,
}: {
  /** Points (BV) — entier. `null` / `undefined` rendent « — », jamais une exception. */
  value: string | number | null | undefined
  className?: string
}) {
  const t = useT()
  const text = formatPoints(value)
  const absent = text === ABSENT

  return (
    <span
      data-unit="points"
      className={cn(
        "inline-flex items-baseline gap-1 tabular-nums",
        absent && "text-muted-foreground",
        className,
      )}
    >
      {text}
      {absent ? null : (
        <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
          {t("unit.points")}
        </span>
      )}
    </span>
  )
}

/**
 * POINTS FIDÉLITÉ — la troisième unité (D-032). Un équilibre sur six n'en rapporte aucun
 * dinar : il donne un Point Fidélité. Les afficher comme des points d'arbre laisserait croire
 * qu'ils alimentent une jambe ; comme des dinars, qu'ils sont dépensables. Ils ne sont ni l'un
 * ni l'autre — leur usage est hors périmètre à ce stade.
 */
export function RewardPoints({
  value,
  className,
}: {
  value: number | null | undefined
  className?: string
}) {
  const t = useT()
  const text = formatPoints(value)
  const absent = text === ABSENT

  return (
    <span
      data-unit="reward"
      className={cn(
        "inline-flex items-baseline gap-1.5 tabular-nums",
        absent && "text-muted-foreground",
        className,
      )}
    >
      {text}
      {absent ? null : (
        <span className="text-[0.65rem] font-medium tracking-wide text-link uppercase">
          {t("unit.rewardPoints")}
        </span>
      )}
    </span>
  )
}
