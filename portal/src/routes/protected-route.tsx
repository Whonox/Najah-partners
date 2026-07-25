import { Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "@/auth/use-auth"
import { useT } from "@/i18n/use-t"

/**
 * Barrière d'authentification.
 *
 * Tant que le rafraîchissement silencieux n'a pas répondu (`restoring`), on n'affiche NI le
 * portail NI la connexion : rediriger trop tôt déconnecterait l'affilié à chaque rechargement
 * de page, alors que sa session est valide. Sur téléphone, où le navigateur recharge un onglet
 * laissé en arrière-plan, ce défaut suffirait à rendre le portail inutilisable.
 *
 * L'adresse demandée est mémorisée : après connexion, on y revient plutôt que de retomber
 * bêtement sur l'accueil.
 */
export function ProtectedRoute() {
  const t = useT()
  const { status } = useAuth()
  const location = useLocation()

  if (status === "restoring") {
    return (
      <div
        role="status"
        className="flex min-h-svh items-center justify-center px-6 text-center text-sm text-muted-foreground"
      >
        {t("session.restoring")}
      </div>
    )
  }

  if (status === "anonymous") {
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
