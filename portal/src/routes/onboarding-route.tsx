import { Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "@/auth/use-auth"

/** Chemin du parcours de première connexion — cité par plusieurs écrans, déclaré une fois. */
export const ONBOARDING_PATH = "/premiere-connexion"

/**
 * Barrière du parcours de première connexion (D-050).
 *
 * ═══ CE GARDE NE PROTÈGE RIEN — IL ORIENTE ═══
 * La vraie barrière est SERVEUR (`OnboardingGuard`, D-057) : sans elle, il suffirait d'appeler
 * l'API pour contourner l'écran. Celui-ci existe pour que l'affilié atterrisse au bon endroit
 * plutôt que sur une succession de « 403 » incompréhensibles. Autrement dit : le backend
 * refuse, le front explique.
 *
 * ═══ POURQUOI IL LIT LE PROFIL ET NON UN APPEL DÉDIÉ ═══
 * `GET /members/me` est la seule route membre ouverte avant la fin du parcours, et elle porte
 * déjà `onboardingCompleted`. Un second appel pour la même information ferait diverger les
 * deux au premier cas limite — et retarderait l'affichage de chaque écran.
 */
export function OnboardingRoute() {
  const { member } = useAuth()
  const location = useLocation()

  // `member` nul ici est impossible en pratique : `ProtectedRoute` est passé avant et a déjà
  // renvoyé les anonymes vers la connexion. On ne redirige donc pas — laisser l'écran se
  // rendre est préférable à une boucle si l'ordre des gardes change un jour.
  if (member && !member.onboardingCompleted) {
    return <Navigate to={ONBOARDING_PATH} replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/**
 * L'inverse : garde le parcours d'accueil LUI-MÊME.
 *
 * Un membre qui a terminé n'a rien à y faire — l'y laisser lui présenterait trois étapes déjà
 * franchies, dont deux que le backend refuserait de rejouer (D-057). On le renvoie à
 * l'accueil.
 */
export function OnboardingOnlyRoute() {
  const { member } = useAuth()

  if (member?.onboardingCompleted) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
