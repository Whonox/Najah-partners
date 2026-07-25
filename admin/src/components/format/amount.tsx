import { cn } from "@/lib/utils"
import { ABSENT, formatDt, formatPoints } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * Les deux unités du modèle à l'écran (D-028). Elles ne doivent JAMAIS se confondre :
 *   — un DINAR est de l'argent : 3 décimales, aligné à droite, unité « DT » ;
 *   — un POINT est une unité d'arbre : entier, jamais aligné en colonne d'argent, unité « pts »
 *     en petites capitales.
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
