import { useState } from "react"
import { Outlet, useLocation } from "react-router"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ErrorBoundary } from "@/components/common/error-boundary"
import { useT } from "@/i18n/use-t"
import { SECONDARY_NAV } from "@/lib/nav"
import { AppHeader } from "./app-header"
import { BottomNav } from "./bottom-nav"
import { Brand } from "./brand"
import { SidebarNav } from "./sidebar-nav"

/**
 * Coquille du portail — MOBILE D'ABORD.
 *
 * Deux dispositions, une seule table de navigation (`lib/nav.ts`) :
 *  — sous `lg` : barre d'onglets FIXE en bas, feuille « Plus » pour les écrans secondaires.
 *    Le contenu réserve la hauteur de la barre (`pb-24`), sinon sa dernière ligne passerait
 *    dessous — défaut qu'on ne voit pas au développement, où l'on scrolle rarement jusqu'en
 *    bas, mais que l'affilié rencontre à chaque page ;
 *  — à partir de `lg` : colonne latérale fixe, barre basse masquée.
 *
 * Le contenu est BORNÉ en largeur (`max-w-4xl`) et centré : sur un écran de 1440 px, des
 * cartes étirées sur toute la largeur rendraient les libellés illisibles (l'œil perd la ligne)
 * — le back-office peut se le permettre, il affiche des tableaux ; le portail affiche des
 * phrases et des chiffres.
 */
export function AppShell() {
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-svh bg-background">
      {/* Grand écran : colonne latérale fixe, avec TOUS les écrans. */}
      <aside className="hidden w-64 shrink-0 flex-col border-e bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b px-4">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      {/* Mobile : la feuille « Plus » ne montre que les écrans SECONDAIRES — les quatre autres
          sont déjà dans la barre d'onglets, et les répéter ferait douter qu'il s'agit des mêmes. */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-xl bg-sidebar p-0 pb-4">
          <SheetHeader className="border-b">
            <SheetTitle>{t("nav.moreTitle")}</SheetTitle>
          </SheetHeader>
          <SidebarNav entries={SECONDARY_NAV} onNavigate={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        {/* `key` sur la route : changer d'écran remonte la page en haut et repart d'un état
            propre. La MÊME clé réarme la limite d'erreur — changer d'écran suffit à sortir
            d'un écran tombé, sans recharger l'application. */}
        <main
          key={location.pathname}
          className="mx-auto w-full min-w-0 max-w-4xl flex-1 px-4 pb-24 pt-5 lg:px-6 lg:pb-10"
        >
          {/* La limite est ICI et pas autour de <AppShell> : la navigation doit survivre à
              l'écran qu'elle affiche. */}
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <BottomNav onOpenMore={() => setMoreOpen(true)} />
    </div>
  )
}
