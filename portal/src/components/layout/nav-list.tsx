import { NavLink } from "react-router"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/use-t"
import { MORE_NAV } from "@/lib/nav"

/**
 * Navigation en LISTE VERTICALE — la feuille « Plus » du téléphone, et elle seule depuis la
 * Tranche 9.6 (la colonne latérale, qui la partageait, a laissé la place à la barre
 * horizontale ; garder le nom `SidebarNav` aurait désigné un meuble qui n'existe plus).
 *
 * Les icônes RESTENT ici, contrairement aux liens de la barre : dans une liste consultée au
 * pouce, elles donnent un point d'accroche et ne coûtent aucune largeur.
 */
export function NavList({
  entries = MORE_NAV,
  onNavigate,
}: {
  entries?: typeof MORE_NAV
  onNavigate?: () => void
}) {
  const t = useT()

  return (
    <nav aria-label={t("nav.moreTitle")} className="p-2">
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
