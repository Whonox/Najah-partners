import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"

/**
 * Marque Najah dans la navigation. Le monogramme est le SEUL aplat d'identité de l'interface —
 * il porte la couleur d'action du thème (or Najah), jamais une couleur écrite ici.
 */
export function Brand({ className }: { className?: string }) {
  const t = useT()
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
      >
        NP
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{t("app.name")}</span>
        <span className="truncate text-xs text-muted-foreground">{t("app.subtitle")}</span>
      </span>
    </div>
  )
}
