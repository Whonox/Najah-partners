import { Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "@/auth/use-auth"
import { useT } from "@/i18n/use-t"

/**
 * Barrière d'authentification. Tant que le rafraîchissement silencieux n'a pas répondu
 * (`restoring`), on n'affiche NI l'application NI la connexion : rediriger trop tôt
 * déconnecterait l'admin à chaque rechargement de page, alors que sa session est valide.
 *
 * L'adresse demandée est mémorisée dans l'état de navigation : après connexion, on y revient.
 */
export function ProtectedRoute() {
  const t = useT()
  const { status } = useAuth()
  const location = useLocation()

  if (status === "restoring") {
    return (
      <div
        role="status"
        className="flex min-h-svh items-center justify-center text-sm text-muted-foreground"
      >
        {t("session.restoring")}
      </div>
    )
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
