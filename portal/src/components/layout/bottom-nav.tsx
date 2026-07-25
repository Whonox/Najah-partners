import { NavLink } from "react-router"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/use-t"
import { PRIMARY_NAV } from "@/lib/nav"

/**
 * BARRE D'ONGLETS BASSE — la navigation principale du portail sur téléphone.
 *
 * Pourquoi en bas et pas un menu « hamburger » en haut : le portail se consulte à une main, et
 * le haut d'un écran de 6 pouces n'est pas atteignable au pouce. Une navigation qu'on doit
 * chercher est une navigation qu'on n'utilise pas — l'affilié resterait sur l'accueil.
 *
 * Cinq cibles au maximum (quatre écrans + « Plus »), chacune d'au moins 44 px de haut : en
 * dessous, on rate sa cible une fois sur trois. C'est cette contrainte, et rien d'autre, qui
 * fixe le nombre d'entrées `primary` dans `lib/nav.ts`.
 *
 * Elle est FIXE en bas de la fenêtre : le contenu réserve la hauteur correspondante
 * (`pb-20` dans la coquille), sinon la dernière ligne de chaque écran passerait dessous.
 */
export function BottomNav({ onOpenMore }: { onOpenMore: () => void }) {
  const t = useT()

  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-sidebar/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch">
        {PRIMARY_NAV.map((entry) => (
          <li key={entry.path} className="flex-1">
            <NavLink
              to={`/${entry.path}`}
              end={entry.path === ""}
              className={({ isActive }) =>
                cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.7rem] font-medium transition-colors",
                  isActive
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground hover:text-sidebar-accent-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <entry.icon className="size-5" aria-hidden />
                  <span className="truncate">{t(entry.labelKey)}</span>
                  {/* Le libellé seul ne suffit pas à repérer l'onglet actif d'un coup d'œil :
                      un trait coloré sous l'icône se voit sans être lu. */}
                  <span
                    aria-hidden
                    className={cn(
                      "h-0.5 w-6 rounded-full",
                      isActive ? "bg-sidebar-primary" : "bg-transparent",
                    )}
                  />
                </>
              )}
            </NavLink>
          </li>
        ))}

        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenMore}
            className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[0.7rem] font-medium text-sidebar-foreground transition-colors hover:text-sidebar-accent-foreground"
          >
            <MoreHorizontal className="size-5" aria-hidden />
            <span className="truncate">{t("nav.more")}</span>
            <span aria-hidden className="h-0.5 w-6 rounded-full bg-transparent" />
          </button>
        </li>
      </ul>
    </nav>
  )
}
