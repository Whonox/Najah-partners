import { useState, type ReactNode } from "react"
import { ChevronDown, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/use-t"
import type { TranslationKey } from "@/i18n/fr"

/**
 * LA PÉDAGOGIE DU PORTAIL, en un seul composant.
 *
 * Le back-office a été salué pour ses textes qui expliquent le modèle ; le portail en a encore
 * plus besoin, parce que son lecteur ne connaît PAS le modèle et n'a aucune raison de
 * l'apprendre. Un affilié qui ne comprend pas pourquoi sa commission a été rabotée écrit au
 * support ; un affilié qui croit que ses points reportés sont perdus se démobilise. Chaque
 * chiffre inhabituel de cet écran doit donc pouvoir s'expliquer SUR PLACE, en une phrase.
 *
 * DEUX FORMES, et le choix entre elles n'est pas cosmétique :
 *  — `inline` : la phrase est TOUJOURS visible, sous le chiffre qu'elle explique. Réservée à
 *    ce qui se comprend mal par défaut (le report des points, le plafond) ;
 *  — `collapsible` : repliée, dépliée d'un clic. Pour ce qui est utile mais pas indispensable
 *    — sur un écran de 390 px, tout déplier d'office noierait le chiffre qu'on vient voir.
 *
 * Les textes vivent dans `i18n/fr.ts` sous `explain.*`, groupés : on peut les relire ensemble
 * et vérifier qu'on raconte partout la même chose.
 */
export function Explain({
  titleKey,
  bodyKey,
  variant = "collapsible",
  className,
}: {
  titleKey: TranslationKey
  bodyKey: TranslationKey
  variant?: "inline" | "collapsible"
  className?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)

  if (variant === "inline") {
    return (
      <p className={cn("text-sm leading-relaxed text-muted-foreground", className)}>
        <Info className="mr-1.5 inline size-4 -translate-y-px" aria-hidden />
        {t(bodyKey)}
      </p>
    )
  }

  return (
    <div className={cn("rounded-lg border bg-muted/40", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm font-medium hover:bg-accent/60 rounded-lg"
      >
        <Info className="size-4 shrink-0 text-link" aria-hidden />
        <span className="flex-1">{t(titleKey)}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <p className="px-3 pb-3 text-sm leading-relaxed text-muted-foreground">
          {t(bodyKey)}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Encadré d'information ponctuel : une remarque qui n'est pas une explication du modèle mais
 * un fait à connaître ici et maintenant (« payer ne dégèle pas », « les frais de livraison se
 * règlent hors plateforme »).
 *
 * `tone` porte l'INTENTION, jamais une couleur : `info` pour ce qui informe, `warning` pour ce
 * qui doit être lu avant d'agir. Aucune valeur en dur — les deux pointent sur des variables du
 * thème (`src/index.css`).
 */
export function Notice({
  title,
  children,
  tone = "info",
  icon,
  className,
}: {
  title?: string
  children: ReactNode
  tone?: "info" | "warning"
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm leading-relaxed",
        tone === "warning"
          ? "border-warning/40 bg-warning/10 text-foreground"
          : "border-border bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      {title ? (
        <p className="mb-1 flex items-center gap-2 font-medium text-foreground">
          {icon ?? <Info className="size-4 shrink-0" aria-hidden />}
          {title}
        </p>
      ) : null}
      {children}
    </div>
  )
}
