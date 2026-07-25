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
import { OrderDetailPage } from "@/pages/orders/order-detail-page"
import { OrdersPage } from "@/pages/orders/orders-page"
import { ProfilePage } from "@/pages/profile/profile-page"
import { ShopPage } from "@/pages/shop/shop-page"
import { SponsorPage } from "@/pages/sponsor/sponsor-page"
import { ProtectedRoute } from "./protected-route"

/**
 * Plan de route du portail.
 *
 * Les chemins sont EN FRANÇAIS (`/e-cards`, `/reseau`, `/gains`) alors que le code est en
 * anglais : une URL est une chose que l'affilié lit, copie et partage — c'est de l'interface,
 * pas du code (CLAUDE.md racine). Les segments restent sans accent pour survivre aux copiés-
 * collés et aux claviers.
 *
 * Tout est sous `ProtectedRoute`, sauf la connexion et le mot de passe oublié. Il n'y a
 * DÉLIBÉRÉMENT aucune route d'inscription : l'inscription est publique et anonyme (D-021), et
 * un parrain n'inscrit pas à la place de son filleul — le formulaire appartient à la vitrine
 * (Tranche 10). Le portail ne fournit que de quoi transmettre son code (`/parrainer`).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />

      <Route element={<ProtectedRoute />}>
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
    </Routes>
  )
}
