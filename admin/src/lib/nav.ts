import {
  BadgeCheck,
  BadgeEuro,
  Boxes,
  CalendarClock,
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
 * Les DOUZE modules du back-office (spec §7.2) — plus, depuis la Tranche 8c, les DEUX FILES DE
 * TÂCHES de l'administration (vérification d'identité, D-018 ; validation des renouvellements,
 * D-038). Ces deux-là ne sont pas des modules numérotés de la spec : ce sont des files de travail
 * quotidien, exigées par leurs décisions respectives et mises en avant sur le tableau de bord.
 * Les laisser accessibles seulement depuis le tableau de bord obligerait à repasser par lui à
 * chaque dossier traité.
 *
 * Tout est déclaré UNE seule fois : le menu latéral et les gardes de route lisent la même table.
 * Ajouter un module, c'est ajouter une ligne ici.
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
    ready: true,
  },
  // ── Les deux FILES DE TÂCHES, juste après le tableau de bord qui les met en avant ──
  {
    // D-018 : NON bloquante. Les trois rôles consultent ; seuls SUPER_ADMIN et MANAGER statuent
    // (filtré dans l'écran, autorisé par le backend).
    path: "verifications",
    labelKey: "nav.verifications",
    icon: BadgeCheck,
    roles: ALL_ROLES,
    ready: true,
  },
  {
    // D-038 : BLOQUANTE — tant que ce n'est pas validé, un gelé ne perçoit rien.
    path: "renewals",
    labelKey: "nav.renewals",
    icon: CalendarClock,
    roles: ALL_ROLES,
    ready: true,
  },
  { path: "members", labelKey: "nav.members", icon: Users, roles: ALL_ROLES, ready: true },
  {
    path: "genealogy",
    labelKey: "nav.genealogy",
    icon: GitFork,
    roles: ALL_ROLES,
    ready: true,
  },
  { path: "packs", labelKey: "nav.packs", icon: Layers, roles: ALL_ROLES, ready: true },
  { path: "products", labelKey: "nav.products", icon: Package, roles: ALL_ROLES, ready: true },
  { path: "orders", labelKey: "nav.orders", icon: Boxes, roles: ALL_ROLES, ready: true },
  {
    path: "commissions",
    labelKey: "nav.commissions",
    icon: BadgeEuro,
    roles: ALL_ROLES,
    ready: true,
  },
  { path: "ledger", labelKey: "nav.ledger", icon: Wallet, roles: ALL_ROLES, ready: true },
  { path: "ecards", labelKey: "nav.ecards", icon: CreditCard, roles: ALL_ROLES, ready: true },
  {
    path: "reports",
    labelKey: "nav.reports",
    icon: FileBarChart,
    roles: ALL_ROLES,
    ready: true,
  },
  { path: "settings", labelKey: "nav.settings", icon: Settings, roles: ALL_ROLES, ready: true },
  {
    // §7.2.12 — comptes admin et rôles : un MANAGER ne s'attribue pas SUPER_ADMIN.
    path: "admin-users",
    labelKey: "nav.adminUsers",
    icon: ShieldCheck,
    roles: ["SUPER_ADMIN"],
    ready: true,
  },
]

/** Route par défaut après connexion. */
export const HOME_PATH = "/dashboard"
