import type { ReactNode } from "react"
import { Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/components/layout/app-shell"
import { ComingSoonPage } from "@/pages/coming-soon-page"
import { GenealogyPage } from "@/pages/genealogy/genealogy-page"
import { LoginPage } from "@/pages/login-page"
import { MemberDetailPage } from "@/pages/members/member-detail-page"
import { MembersPage } from "@/pages/members/members-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { OrderDetailPage } from "@/pages/orders/order-detail-page"
import { OrdersPage } from "@/pages/orders/orders-page"
import { PacksPage } from "@/pages/packs/packs-page"
import { ProductsPage } from "@/pages/products/products-page"
import { SettingsPage } from "@/pages/settings-page"
import { HOME_PATH, NAV_MODULES } from "@/lib/nav"
import { ProtectedRoute } from "./protected-route"
import { RoleRoute } from "./role-route"

/**
 * Écrans réellement construits, indexés par le chemin du module. Un module absent de cette
 * table affiche « À venir » : la navigation des 12 modules (spec §7.2) existe dès maintenant,
 * les tranches suivantes n'ont qu'à ajouter une ligne ici.
 */
const MODULE_SCREENS: Record<string, ReactNode> = {
  members: <MembersPage />,
  genealogy: <GenealogyPage />,
  packs: <PacksPage />,
  products: <ProductsPage />,
  orders: <OrdersPage />,
  settings: <SettingsPage />,
}

/**
 * Écrans de DÉTAIL, imbriqués sous le chemin de leur module (`members/:memberId`). Déclarés
 * à part parce qu'ils portent un paramètre, là où la table ci-dessus indexe des modules.
 *
 * Ils héritent de la MÊME garde de rôle que leur module : protéger la liste sans protéger la
 * fiche laisserait la donnée accessible à quiconque connaît un identifiant.
 */
const MODULE_DETAILS: Record<string, { path: string; element: ReactNode }> = {
  members: { path: ":memberId", element: <MemberDetailPage /> },
  orders: { path: ":orderId", element: <OrderDetailPage /> },
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Tout le reste exige une session ADMIN. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={HOME_PATH} replace />} />

          {NAV_MODULES.map((module) => {
            const detail = MODULE_DETAILS[module.path]
            // Garde par rôle sur la ROUTE, pas seulement sur l'entrée de menu : masquer un
            // lien n'empêche personne de taper l'URL.
            const guard = (screen: ReactNode) => (
              <RoleRoute allow={module.roles}>{screen}</RoleRoute>
            )

            return (
              <Route key={module.path} path={module.path}>
                <Route
                  index
                  element={guard(
                    MODULE_SCREENS[module.path] ?? (
                      <ComingSoonPage titleKey={module.labelKey} />
                    ),
                  )}
                />
                {detail ? (
                  <Route path={detail.path} element={guard(detail.element)} />
                ) : null}
              </Route>
            )
          })}

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
