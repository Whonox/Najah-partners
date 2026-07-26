import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Surface } from "./surface"

/**
 * Un chiffre et ce qu'il signifie.
 *
 * `tone` porte l'IMPORTANCE, pas une couleur :
 *  — `plain` : la majorité des chiffres ;
 *  — `highlight` : le solde et les gains, sur la surface dorée du portail. C'est là que
 *    l'identité entre dans l'interface (portal/CLAUDE.md : usage plus généreux de l'accent).
 *
 * Ces cartes vivent presque toujours en GRILLE, côte à côte : elles s'appuient donc sur la
 * variante `card` de `Surface`, qui porte un filet. Deux chiffres adjacents sans limite se
 * lisent comme un seul bloc, et l'on ne sait plus quelle phrase explique quel nombre.
 *
 * `hint` n'est pas décoratif : c'est la phrase qui évite un ticket au support. Un chiffre du
 * modèle MLM sans sa phrase (« en réserve », « perdu au plafond ») se lit de travers.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "plain",
  action,
  className,
}: {
  label: string
  /** Déjà formaté par `MoneyDt` / `PointsBv` : cette carte ne formate rien elle-même. */
  value: ReactNode
  hint?: string
  icon?: ReactNode
  tone?: "plain" | "highlight"
  action?: ReactNode
  className?: string
}) {
  const highlight = tone === "highlight"

  return (
    <Surface
      variant={highlight ? "highlight" : "card"}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-sm font-medium",
            highlight ? "text-highlight-foreground/80" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {icon ? (
          <span className={highlight ? "text-link" : "text-muted-foreground"} aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>

      <div className={cn("font-semibold", highlight ? "text-3xl" : "text-2xl")}>{value}</div>

      {hint ? (
        <p
          className={cn(
            "text-xs leading-relaxed",
            highlight ? "text-highlight-foreground/70" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      ) : null}

      {action ? <div className="pt-1">{action}</div> : null}
    </Surface>
  )
}
