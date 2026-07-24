import { cn } from "@/lib/utils"
import { formatDt, formatPoints } from "@/lib/format"
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
  /** Montant tel qu'il vient de l'API : une CHAÎNE décimale (jamais un flottant). */
  value: string | number
  className?: string
}) {
  const t = useT()
  return (
    <span
      data-unit="dt"
      className={cn(
        "inline-flex items-baseline justify-end gap-1 font-medium tabular-nums",
        className,
      )}
    >
      {formatDt(value)}
      <span className="text-xs font-normal text-muted-foreground">{t("unit.dt")}</span>
    </span>
  )
}

export function PointsBv({
  value,
  className,
}: {
  /** Points (BV) — entier. */
  value: string | number
  className?: string
}) {
  const t = useT()
  return (
    <span
      data-unit="points"
      className={cn("inline-flex items-baseline gap-1 tabular-nums", className)}
    >
      {formatPoints(value)}
      <span className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
        {t("unit.points")}
      </span>
    </span>
  )
}
