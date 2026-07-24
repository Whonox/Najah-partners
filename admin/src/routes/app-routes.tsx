import type { ReactNode } from "react"
import { Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/components/layout/app-shell"
import { ComingSoonPage } from "@/pages/coming-soon-page"
import { LoginPage } from "@/pages/login-page"
import { NotFoundPage } from "@/pages/not-found-page"
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
  settings: <SettingsPage />,
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Tout le reste exige une session ADMIN. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={HOME_PATH} replace />} />

          {NAV_MODULES.map((module) => (
            <Route
              key={module.path}
              path={module.path}
              element={
                // Garde par rôle sur la ROUTE, pas seulement sur l'entrée de menu : masquer un
                // lien n'empêche personne de taper l'URL.
                <RoleRoute allow={module.roles}>
                  {MODULE_SCREENS[module.path] ?? <ComingSoonPage titleKey={module.labelKey} />}
                </RoleRoute>
              }
            />
          ))}

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
