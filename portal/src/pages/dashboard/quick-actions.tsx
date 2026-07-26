import { Link } from "react-router"
import { CreditCard, Network, Share2, ShoppingBag } from "lucide-react"
import { useT } from "@/i18n/use-t"

/**
 * ACTIONS RAPIDES en icônes (D-053) : parrainer, boutique, mon arbre, mes e-cards.
 *
 * ═══ QUATRE, ET PAS PLUS ═══
 * Quatre tiennent sur une ligne à 390 px sans devenir des cibles minuscules. Au-delà, on
 * n'aurait plus des raccourcis mais un second menu — et le portail en a déjà un, en bas de
 * l'écran. Ce sont les quatre INTENTIONS, celles qu'on vient accomplir ; la navigation
 * habituelle reste à la barre d'onglets.
 *
 * « Mon arbre » et « Mes e-cards » figurent aussi dans la barre : les répéter ici est
 * délibéré. Un raccourci d'accueil et un onglet ne servent pas le même geste — l'un se prend
 * en arrivant, l'autre quand on sait déjà où l'on va.
 */
const ACTIONS = [
  { to: "/parrainer", icon: Share2, key: "sponsor" },
  { to: "/boutique", icon: ShoppingBag, key: "shop" },
  { to: "/reseau", icon: Network, key: "tree" },
  { to: "/e-cards", icon: CreditCard, key: "ecards" },
] as const

export function QuickActions() {
  const t = useT()

  return (
    <nav aria-label={t("home.actions")} className="grid grid-cols-4 gap-2 sm:gap-3">
      {ACTIONS.map(({ to, icon: Icon, key }) => (
        <Link
          key={to}
          to={to}
          className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-card p-2 text-center transition-colors hover:bg-muted"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/12">
            <Icon className="size-5 text-primary" aria-hidden />
          </span>
          <span className="text-xs font-medium leading-tight">
            {t(`home.action.${key}` as never)}
          </span>
        </Link>
      ))}
    </nav>
  )
}
