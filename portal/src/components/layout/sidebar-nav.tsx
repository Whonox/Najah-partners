import { NavLink } from "react-router"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/use-t"
import { NAV_ENTRIES } from "@/lib/nav"

/**
 * Navigation en liste — utilisée par la colonne latérale (grand écran) ET par la feuille
 * « Plus » (mobile), avec la même table `NAV_ENTRIES`. Un seul composant pour les deux : le
 * menu ne peut pas diverger d'une taille d'écran à l'autre.
 *
 * `entries` permet à la feuille mobile de ne montrer que les écrans SECONDAIRES — les quatre
 * autres sont déjà dans la barre d'onglets, les répéter ferait douter qu'il s'agit des mêmes.
 */
export function SidebarNav({
  entries = NAV_ENTRIES,
  onNavigate,
}: {
  entries?: typeof NAV_ENTRIES
  onNavigate?: () => void
}) {
  const t = useT()

  return (
    <nav aria-label={t("nav.label")} className="p-2">
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.path}>
            <NavLink
              to={`/${entry.path}`}
              end={entry.path === ""}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )
              }
            >
              <entry.icon className="size-4.5 shrink-0" aria-hidden />
              <span className="truncate">{t(entry.labelKey)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
