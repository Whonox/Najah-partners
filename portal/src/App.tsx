import { useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter } from "react-router"
import { createQueryClient } from "@/api/query-client"
import { AuthProvider } from "@/auth/auth-provider"
import { Toaster } from "@/components/ui/sonner"
import { I18nProvider } from "@/i18n/i18n-provider"
import { AppRoutes } from "@/routes/app-routes"
import { ThemeProvider } from "@/theme/theme-provider"

/**
 * Ordre des fournisseurs, et pourquoi :
 *   QueryClient  → AuthProvider s'en sert pour vider le cache à la déconnexion ;
 *   Theme        → le Toaster et toute l'interface lisent le mode courant ;
 *   I18n         → pose `lang`/`dir` sur <html> (prêt pour l'arabe/RTL) ;
 *   BrowserRouter→ AuthProvider et les gardes de route naviguent ;
 *   Auth         → dernière barrière avant les écrans.
 */
export default function App() {
  // Instance unique, créée au premier rendu (et pas à chaque rendu, ce qui viderait le cache).
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider locale="fr">
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
              {/* En HAUT sur le portail : la barre d'onglets occupe le bas de l'écran sur
                  téléphone, et un toast posé dessous serait masqué par elle au moment précis
                  où il compte (« code copié », « paiement enregistré »). */}
              <Toaster position="top-center" />
            </AuthProvider>
          </BrowserRouter>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
