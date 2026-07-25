import {
  CreditCard,
  Home,
  Network,
  Package,
  Receipt,
  Share2,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import type { TranslationKey } from "@/i18n/fr"

/**
 * Les écrans du portail (spec §7.1), déclarés UNE seule fois : la barre d'onglets mobile, la
 * feuille « Plus » et la colonne latérale lisent tous cette table. Ajouter un écran, c'est
 * ajouter une ligne ici.
 *
 * ═══ `primary` : LE CHOIX DE CONCEPTION MOBILE ═══
 * Les affiliés consultent au téléphone. Une barre d'onglets basse ne tient QUE cinq entrées
 * avant de devenir illisible au pouce — au-delà, les cibles passent sous les 44 px
 * recommandés. Quatre écrans sont donc marqués `primary` (plus l'entrée « Plus », ajoutée par
 * la barre elle-même), et ce sont ceux qu'on ouvre plusieurs fois par semaine : l'accueil, ses
 * gains, ses e-cards, son réseau.
 *
 * Les autres — boutique, commandes, parrainage, profil — se visitent par intention, pas par
 * habitude : ils vivent dans la feuille « Plus ». Sur grand écran, la distinction disparaît :
 * la colonne latérale les montre tous, il n'y a plus de contrainte de largeur.
 */
export interface NavEntry {
  /** Segment de route, sous la racine protégée. En français : c'est une URL que l'affilié lit. */
  path: string
  labelKey: TranslationKey
  icon: LucideIcon
  /** Présent dans la barre d'onglets basse (mobile). Au plus quatre. */
  primary: boolean
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { path: "", labelKey: "nav.dashboard", icon: Home, primary: true },
  { path: "gains", labelKey: "nav.commissions", icon: Wallet, primary: true },
  { path: "e-cards", labelKey: "nav.ecards", icon: CreditCard, primary: true },
  { path: "reseau", labelKey: "nav.network", icon: Network, primary: true },
  { path: "boutique", labelKey: "nav.shop", icon: Package, primary: false },
  { path: "commandes", labelKey: "nav.orders", icon: Receipt, primary: false },
  { path: "parrainer", labelKey: "nav.sponsor", icon: Share2, primary: false },
  { path: "profil", labelKey: "nav.profile", icon: User, primary: false },
]

export const PRIMARY_NAV = NAV_ENTRIES.filter((entry) => entry.primary)
export const SECONDARY_NAV = NAV_ENTRIES.filter((entry) => !entry.primary)
