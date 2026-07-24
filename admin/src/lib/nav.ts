import {
  BadgeEuro,
  Boxes,
  CreditCard,
  FileBarChart,
  GitFork,
  LayoutDashboard,
  Layers,
  Package,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import type { AdminRole } from "@/auth/auth-context"
import type { TranslationKey } from "@/i18n/fr"

/**
 * Les DOUZE modules du back-office (spec §7.2), déclarés UNE seule fois : le menu latéral et
 * les gardes de route lisent la même table. Ajouter un module, c'est ajouter une ligne ici.
 *
 * `roles` = qui peut OUVRIR le module (droit de lecture). Les actions sensibles à l'intérieur
 * d'un module (créer de la valeur, ajuster un solde, modifier un paramètre) sont filtrées
 * écran par écran, sur le même modèle que le backend.
 *
 * RAPPEL D'ARCHITECTURE : le front ne fait que MASQUER. L'autorisation réelle est côté backend
 * (@RequireActor + @Roles) — masquer une entrée n'a jamais protégé une donnée, et un rôle
 * SUPPORT qui tape l'URL d'un module interdit reçoit un 403 du serveur, pas de la sidebar.
 */
export interface NavModule {
  /** Segment de route, sous la racine protégée. */
  path: string
  labelKey: TranslationKey
  icon: LucideIcon
  /** Rôles autorisés à ouvrir le module. Liste vide = les trois rôles. */
  roles: readonly AdminRole[]
  /** Faux tant que le module n'est pas construit : la page affiche « À venir ». */
  ready: boolean
}

const ALL_ROLES: readonly AdminRole[] = []

export const NAV_MODULES: readonly NavModule[] = [
  {
    path: "dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    roles: ALL_ROLES,
    ready: false,
  },
  { path: "members", labelKey: "nav.members", icon: Users, roles: ALL_ROLES, ready: false },
  {
    path: "genealogy",
    labelKey: "nav.genealogy",
    icon: GitFork,
    roles: ALL_ROLES,
    ready: false,
  },
  { path: "packs", labelKey: "nav.packs", icon: Layers, roles: ALL_ROLES, ready: false },
  { path: "products", labelKey: "nav.products", icon: Package, roles: ALL_ROLES, ready: false },
  { path: "orders", labelKey: "nav.orders", icon: Boxes, roles: ALL_ROLES, ready: false },
  {
    path: "commissions",
    labelKey: "nav.commissions",
    icon: BadgeEuro,
    roles: ALL_ROLES,
    ready: false,
  },
  { path: "ledger", labelKey: "nav.ledger", icon: Wallet, roles: ALL_ROLES, ready: false },
  { path: "ecards", labelKey: "nav.ecards", icon: CreditCard, roles: ALL_ROLES, ready: false },
  {
    path: "reports",
    labelKey: "nav.reports",
    icon: FileBarChart,
    roles: ALL_ROLES,
    ready: false,
  },
  { path: "settings", labelKey: "nav.settings", icon: Settings, roles: ALL_ROLES, ready: true },
  {
    // §7.2.12 — comptes admin et rôles : un MANAGER ne s'attribue pas SUPER_ADMIN.
    path: "admin-users",
    labelKey: "nav.adminUsers",
    icon: ShieldCheck,
    roles: ["SUPER_ADMIN"],
    ready: false,
  },
]

/** Route par défaut après connexion. */
export const HOME_PATH = "/dashboard"
