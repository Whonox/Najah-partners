import { useState } from "react"
import { Outlet, useLocation } from "react-router"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useT } from "@/i18n/use-t"
import { AppHeader } from "./app-header"
import { Brand } from "./brand"
import { SidebarNav } from "./sidebar-nav"

/**
 * Coquille du back-office : navigation à gauche, en-tête en haut, zone de travail NEUTRE au
 * centre (aucune décoration — les données priment).
 *
 * Responsive : au-dessus de `lg`, la barre latérale est fixe ; en dessous, elle devient un
 * panneau coulissant ouvert depuis l'en-tête. Un même `<SidebarNav>` sert les deux — le menu
 * ne peut pas diverger entre les deux tailles d'écran.
 */
export function AppShell() {
  const t = useT()
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-svh bg-background">
      {/* Grand écran : barre latérale fixe. */}
      <aside className="hidden w-64 shrink-0 flex-col border-e bg-sidebar lg:flex">
        <div className="flex h-14 items-center border-b px-3">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      {/* Petit écran : le même menu, en panneau coulissant. */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetHeader className="border-b">
            <SheetTitle className="sr-only">{t("nav.label")}</SheetTitle>
            <Brand />
          </SheetHeader>
          <div className="overflow-y-auto">
            <SidebarNav onNavigate={() => setNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onOpenNav={() => setNavOpen(true)} />
        {/* `key` sur la route : un changement de module remonte la page en haut et repart d'un
            état propre, sans qu'aucun écran n'ait à s'en préoccuper. */}
        <main key={location.pathname} className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
