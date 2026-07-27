import { useState } from "react"
import { Link, Outlet, useLocation } from "react-router"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ErrorBoundary } from "@/components/common/error-boundary"
import { useT } from "@/i18n/use-t"
import { SPONSOR_ENTRY } from "@/lib/nav"
import { BottomNav } from "./bottom-nav"
import { NavList } from "./nav-list"
import { TopBar } from "./top-bar"

/**
 * Coquille du portail — une seule COLONNE, et une navigation HORIZONTALE (Tranche 9.6).
 *
 * Deux dispositions, une seule table de navigation (`lib/nav.ts`) :
 *  — sous `lg` : en-tête simple en haut (marque + menu compte) et barre d'onglets FIXE en bas,
 *    doublée de la feuille « Plus ». Le contenu réserve la hauteur de la barre (`pb-24`), sinon
 *    sa dernière ligne passerait dessous — défaut qu'on ne voit pas au développement, où l'on
 *    scrolle rarement jusqu'en bas, mais que l'affilié rencontre à chaque page ;
 *  — à partir de `lg` : la barre horizontale flottante (`TopBar`), qui remplace la colonne
 *    latérale de la Tranche 9. Elle est COLLANTE mais dans le flux : rien à compenser ici.
 *
 * Le contenu est BORNÉ en largeur (`max-w-4xl`) et centré : sur un écran de 1440 px, des
 * cartes étirées sur toute la largeur rendraient les libellés illisibles (l'œil perd la ligne)
 * — le back-office peut se le permettre, il affiche des tableaux ; le portail affiche des
 * phrases et des chiffres. La barre, elle, est bornée un cran plus large (`max-w-5xl`) : c'est
 * du chrome, il encadre le contenu au lieu de s'aligner dessus.
 */
export function AppShell() {
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <TopBar />

      {/* Téléphone : « Tout le portail » — l'index complet, tout ce que la barre d'onglets
          basse ne montre pas. « Parrainer » y est traité comme dans la barre horizontale : un
          BOUTON en tête, pas une ligne de liste. C'est l'action commerciale de la plateforme,
          et sur téléphone elle n'a aucune autre porte d'entrée. */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          closeLabel={t("nav.close")}
          className="rounded-t-xl bg-sidebar p-0 pb-4"
        >
          <SheetHeader className="border-b">
            <SheetTitle>{t("nav.moreTitle")}</SheetTitle>
          </SheetHeader>

          <div className="px-4 pt-4">
            <Button
              size="lg"
              nativeButton={false}
              className="h-11 w-full rounded-full"
              render={<Link to={`/${SPONSOR_ENTRY.path}`} />}
              onClick={() => setMoreOpen(false)}
            >
              <UserPlus aria-hidden />
              {t(SPONSOR_ENTRY.labelKey)}
            </Button>
          </div>

          <NavList onNavigate={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>

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

      <BottomNav onOpenMore={() => setMoreOpen(true)} />
    </div>
  )
}
