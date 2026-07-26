import { Route, Routes } from "react-router"
import { AppShell } from "@/components/layout/app-shell"
import { CommissionDetailPage } from "@/pages/commissions/commission-detail-page"
import { CommissionsPage } from "@/pages/commissions/commissions-page"
import { DashboardPage } from "@/pages/dashboard/dashboard-page"
import { EcardsPage } from "@/pages/ecards/ecards-page"
import { ForgotPasswordPage } from "@/pages/forgot-password-page"
import { LoginPage } from "@/pages/login-page"
import { NetworkPage } from "@/pages/network/network-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { OnboardingPage } from "@/pages/onboarding/onboarding-page"
import { RegisterPage } from "@/pages/register/register-page"
import { OrderDetailPage } from "@/pages/orders/order-detail-page"
import { OrdersPage } from "@/pages/orders/orders-page"
import { ProfilePage } from "@/pages/profile/profile-page"
import { ShopPage } from "@/pages/shop/shop-page"
import { SponsorPage } from "@/pages/sponsor/sponsor-page"
import {
  ONBOARDING_PATH,
  OnboardingOnlyRoute,
  OnboardingRoute,
} from "./onboarding-route"
import { ProtectedRoute } from "./protected-route"

/**
 * Plan de route du portail.
 *
 * Les chemins sont EN FRANÇAIS (`/e-cards`, `/reseau`, `/gains`) alors que le code est en
 * anglais : une URL est une chose que l'affilié lit, copie et partage — c'est de l'interface,
 * pas du code (CLAUDE.md racine). Les segments restent sans accent pour survivre aux copiés-
 * collés et aux claviers.
 *
 * TROIS NIVEAUX D'ACCÈS, et l'ordre des barrières compte :
 *
 *  1. PUBLIC — connexion, mot de passe oublié, et depuis D-052 l'INSCRIPTION. Elle appartenait
 *     à la vitrine dans le plan de la Tranche 9 ; la cliente l'a ramenée ici. Elle reste
 *     publique et anonyme (D-021) : aucune session n'est requise pour la remplir.
 *
 *  2. AUTHENTIFIÉ MAIS PAS ENCORE ENTRÉ — le parcours de première connexion (D-050). Il est
 *     sous `ProtectedRoute` (il faut être connecté pour déposer sa pièce) mais HORS de
 *     `OnboardingRoute`, sinon il se renverrait vers lui-même à l'infini. `OnboardingOnlyRoute`
 *     fait l'inverse : un membre qui a terminé n'a rien à y faire.
 *
 *  3. LE PORTAIL — tout le reste, derrière `OnboardingRoute`. Ce garde n'est qu'un aiguillage :
 *     la vraie barrière est SERVEUR (403 `ONBOARDING_REQUIRED`, D-057). Le backend refuse, le
 *     front explique.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="/inscription" element={<RegisterPage />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<OnboardingOnlyRoute />}>
          <Route path={ONBOARDING_PATH} element={<OnboardingPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<OnboardingRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="gains" element={<CommissionsPage />} />
          <Route path="gains/:runId" element={<CommissionDetailPage />} />
          <Route path="e-cards" element={<EcardsPage />} />
          <Route path="reseau" element={<NetworkPage />} />
          <Route path="boutique" element={<ShopPage />} />
          <Route path="commandes" element={<OrdersPage />} />
          <Route path="commandes/:orderId" element={<OrderDetailPage />} />
          <Route path="parrainer" element={<SponsorPage />} />
          <Route path="profil" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        </Route>
      </Route>
    </Routes>
  )
}
