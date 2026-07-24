import type { ReactNode } from "react"
import { Outlet } from "react-router"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAuth } from "@/auth/use-auth"
import type { AdminRole } from "@/auth/auth-context"
import { useT } from "@/i18n/use-t"

/**
 * Garde par RÔLE, réutilisable (D-017b). S'utilise autour d'une route (`<RoleRoute allow={…}>`
 * avec l'`<Outlet>` implicite) ou autour d'un fragment d'écran (`children`).
 *
 * RAPPEL : le front ne fait que MASQUER. L'autorisation qui compte est celle du backend
 * (@RequireActor + @Roles) — ce composant évite un écran vide et un aller-retour inutile, il ne
 * protège aucune donnée. C'est pourquoi il affiche un refus explicite plutôt qu'une page vide :
 * l'utilisateur doit comprendre que c'est son RÔLE qui bloque, pas l'application qui casse.
 */
export function RoleRoute({
  allow,
  children,
}: {
  allow: readonly AdminRole[]
  children?: ReactNode
}) {
  const t = useT()
  const { hasRole } = useAuth()

  if (!hasRole(allow)) {
    return (
      <Alert>
        <AlertTitle>{t("state.forbiddenTitle")}</AlertTitle>
        <AlertDescription>{t("state.forbiddenBody")}</AlertDescription>
      </Alert>
    )
  }

  return <>{children ?? <Outlet />}</>
}
