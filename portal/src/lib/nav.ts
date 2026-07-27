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
 * Les écrans du portail (spec §7.1), déclarés UNE seule fois : la barre horizontale, le menu
 * compte, la barre d'onglets mobile et la feuille « Plus » lisent tous cette table. Ajouter un
 * écran, c'est ajouter une ligne ici — et choisir sa `place`.
 *
 * ═══ POURQUOI UNE `place` ET PLUS UN BOOLÉEN `primary` ═══
 * Jusqu'à la Tranche 9.6, la seule question posée à une entrée était « tient-elle dans la barre
 * basse du téléphone ? ». Le chrome de bureau, lui, montrait TOUT dans une colonne latérale :
 * il n'avait rien à trancher. La barre HORIZONTALE, elle, n'est pas extensible — cinq liens et
 * pas six —, et deux destinations n'y ont jamais eu leur place :
 *
 *  — « Parrainer » est l'action commerciale de la plateforme, pas une adresse. Noyée dans une
 *    liste de liens, elle se lit comme un écran parmi huit ; elle sort donc de la barre pour
 *    devenir un BOUTON d'accent (`SPONSOR_ENTRY`).
 *  — « Mon profil » et « Mes commandes » se visitent depuis son compte, pas depuis la barre :
 *    elles vivent dans le menu compte (`ACCOUNT_NAV`).
 *
 * Les quatre surfaces se lisent donc ici, et une entrée qui n'apparaîtrait NULLE PART serait
 * une destination inatteignable — c'est ce que vérifie `nav.test.ts`, parce qu'un lien manquant
 * ne plante pas et ne se voit pas.
 */
export type NavPlace =
  /** Dans la barre horizontale (grand écran). Cinq, pas six — voir `BAR_NAV`. */
  | "bar"
  /** Dans le menu compte (avatar), à toutes les largeurs. */
  | "account"
  /** Bouton d'accent « Parrainer » : ni lien de barre, ni entrée de menu. */
  | "cta"

export interface NavEntry {
  /** Segment de route, sous la racine protégée. En français : c'est une URL que l'affilié lit. */
  path: string
  labelKey: TranslationKey
  icon: LucideIcon
  place: NavPlace
  /**
   * Présent dans la barre d'onglets BASSE (téléphone). Au plus quatre : au-delà, les cibles
   * passent sous les 44 px et l'on rate sa cible une fois sur trois. Indépendant de `place` —
   * le pouce et le curseur n'ont pas les mêmes contraintes, et l'on ne réordonne pas les
   * habitudes d'un affilié parce que le chrome de bureau a changé.
   */
  primary: boolean
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { path: "", labelKey: "nav.dashboard", icon: Home, place: "bar", primary: true },
  { path: "reseau", labelKey: "nav.network", icon: Network, place: "bar", primary: true },
  { path: "boutique", labelKey: "nav.shop", icon: Package, place: "bar", primary: false },
  { path: "gains", labelKey: "nav.commissions", icon: Wallet, place: "bar", primary: true },
  { path: "e-cards", labelKey: "nav.ecards", icon: CreditCard, place: "bar", primary: true },
  { path: "parrainer", labelKey: "nav.sponsor", icon: Share2, place: "cta", primary: false },
  { path: "profil", labelKey: "nav.profile", icon: User, place: "account", primary: false },
  { path: "commandes", labelKey: "nav.orders", icon: Receipt, place: "account", primary: false },
]

/**
 * Les cinq liens de la barre horizontale, DANS L'ORDRE de lecture : on part de chez soi, on
 * regarde son réseau, on achète, on regarde ce que ça rapporte, on gère sa monnaie.
 */
export const BAR_NAV = NAV_ENTRIES.filter((entry) => entry.place === "bar")

/** Mon profil, Mes commandes — dans le menu compte. */
export const ACCOUNT_NAV = NAV_ENTRIES.filter((entry) => entry.place === "account")

/**
 * « Parrainer ». Extraite de toute liste : un appel à l'action rendu comme un lien n'appelle
 * plus rien. Elle est rendue en BOUTON dans la barre, et en tête de la feuille « Plus ».
 */
export const SPONSOR_ENTRY = NAV_ENTRIES.find((entry) => entry.place === "cta")!

/** Barre d'onglets basse (téléphone). */
export const PRIMARY_NAV = NAV_ENTRIES.filter((entry) => entry.primary)

/**
 * Feuille « Plus » (téléphone) : tout ce qui n'est PAS dans la barre d'onglets basse, moins le
 * bouton « Parrainer », que la feuille rend séparément en tête.
 *
 * Son titre — « Tout le portail » — dit qu'elle est l'INDEX COMPLET du portail sur téléphone.
 * Elle recouvre donc volontairement le menu compte (profil, commandes) : sur un écran où la
 * barre horizontale n'existe pas, c'est la seule surface qui montre l'ensemble des écrans.
 * À ne pas confondre avec le recouvrement proscrit depuis la Tranche 9, celui de la barre
 * d'onglets et de la feuille : répéter dans « Plus » un onglet visible juste en dessous ferait
 * douter qu'il s'agit du même écran.
 */
export const MORE_NAV = NAV_ENTRIES.filter(
  (entry) => !entry.primary && entry.place !== "cta",
)
