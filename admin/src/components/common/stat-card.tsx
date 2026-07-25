import type { ReactNode } from "react"
import { Link } from "react-router"
import { ArrowRight, type LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Une valeur mise en avant (KPI). Ce n'est PAS un graphe : un chiffre unique se lit mieux en
 * chiffre — un camembert à une part ou une jauge décorative n'ajouteraient rien.
 *
 * `value` est un `ReactNode` et non une chaîne, pour que l'appelant passe `<MoneyDt>` ou
 * `<PointsBv>` : ces composants portent l'invariant D-028 (3 décimales alignées à droite pour un
 * dinar, entier pour un point). Formater ici obligerait la carte à savoir quelle unité elle
 * affiche, et un jour elle se tromperait.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: LucideIcon
  className?: string
}) {
  return (
    <Card className={cn("gap-0 p-0", className)}>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </span>
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

/**
 * Une TÂCHE en attente : même gabarit qu'un KPI, mais cliquable et signalée quand le compteur
 * n'est pas nul. C'est ce que l'admin doit voir en arrivant (§7.2.1).
 *
 * À zéro, la carte reste GRISE et dit « rien à traiter ». Elle ne disparaît pas : une file
 * absente se lirait comme une file oubliée, et l'admin irait la chercher ailleurs.
 */
export function TaskCard({
  label,
  count,
  to,
  hint,
  icon: Icon,
  /** `blocking` : ne pas traiter cette file EMPÊCHE quelque chose (un gel qui perdure, D-038). */
  blocking = false,
}: {
  label: string
  count: number
  to: string
  hint: string
  icon?: LucideIcon
  blocking?: boolean
}) {
  const pending = count > 0

  return (
    <Card
      className={cn(
        "gap-0 p-0 transition-colors",
        // La couleur SIGNALE, elle ne décore pas : seule une file non vide ET bloquante
        // emprunte la teinte d'alerte.
        pending && blocking && "border-destructive/50",
        pending && !blocking && "border-primary/50",
      )}
    >
      <CardContent className="p-0">
        <Link
          to={to}
          className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
              <span className="text-sm font-medium">{label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                !pending && "text-muted-foreground",
              )}
            >
              {count}
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}
