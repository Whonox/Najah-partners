import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"

/**
 * Marque Najah. Le monogramme porte la couleur d'action du thème (or Najah) — jamais une
 * couleur écrite ici.
 *
 * Deux formes :
 *  — `stacked` (défaut) : monogramme + nom + sous-titre sur deux lignes. Pour les écrans
 *    publics (connexion, inscription, première connexion), où la marque a la place de se
 *    présenter ;
 *  — `compact` : une seule ligne, sans sous-titre, pour la barre du portail. Le mot-symbole
 *    lui-même s'efface entre `lg` et `xl` — c'est la plage où la barre est la plus contrainte
 *    (cinq liens + bouton d'accent + avatar dans 992 px utiles à 1024). Le monogramme, lui,
 *    ne disparaît jamais : c'est le retour à l'accueil.
 */
export function Brand({
  className,
  variant = "stacked",
}: {
  className?: string
  variant?: "stacked" | "compact"
}) {
  const t = useT()

  if (variant === "compact") {
    return (
      <span className={cn("flex items-center gap-2.5", className)}>
        <Monogram />
        <span className="truncate text-sm font-semibold lg:hidden xl:inline">
          {t("app.name")}
        </span>
      </span>
    )
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Monogram />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{t("app.name")}</span>
        <span className="truncate text-xs text-muted-foreground">{t("app.subtitle")}</span>
      </span>
    </div>
  )
}

function Monogram() {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
    >
      NP
    </span>
  )
}
