import { NavLink } from "react-router"
import { useAuth } from "@/auth/use-auth"
import { useT } from "@/i18n/use-t"
import { NAV_MODULES } from "@/lib/nav"
import { cn } from "@/lib/utils"

/**
 * Menu des 12 modules (spec §7.2), filtré par rôle. Un module que le rôle courant ne peut pas
 * ouvrir n'apparaît pas — mais c'est un CONFORT, pas une sécurité : la garde de route et le
 * backend refusent l'accès même si quelqu'un tape l'URL à la main.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT()
  const { hasRole } = useAuth()

  return (
    <nav aria-label={t("nav.label")} className="flex flex-col gap-0.5 p-2">
      {NAV_MODULES.filter((module) => hasRole(module.roles)).map((module) => (
        <NavLink
          key={module.path}
          to={`/${module.path}`}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive &&
                "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
            )
          }
        >
          <module.icon className="size-4 shrink-0" />
          <span className="truncate">{t(module.labelKey)}</span>
          {!module.ready ? (
            <span className="ms-auto shrink-0 text-[0.65rem] tracking-wide uppercase opacity-60">
              {t("comingSoon.badge")}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  )
}
