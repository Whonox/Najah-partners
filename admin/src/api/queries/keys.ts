/**
 * Clés de cache TanStack Query, déclarées UNE fois.
 *
 * Convention posée en Tranche 8a (`["admin", "settings"]`) et généralisée ici :
 *
 *     ["admin", <module>]                → toutes les données du module
 *     ["admin", <module>, "list", <params>] → une liste, avec ses filtres
 *     ["admin", <module>, "detail", <id>]   → une fiche
 *
 * La HIÉRARCHIE fait tout le travail d'invalidation. `invalidateQueries({ queryKey:
 * MEMBERS_KEYS.all })` invalide la liste ET la fiche, parce que TanStack compare les clés
 * par PRÉFIXE. C'est ce qui répond à l'exigence « modifier un membre rafraîchit sa fiche ET
 * la liste » sans énumérer, à chaque mutation, tous les écrans à rafraîchir — énumération
 * qu'on oublierait de compléter au premier écran ajouté.
 *
 * Les paramètres de liste entrent dans la clé : deux jeux de filtres sont deux caches
 * distincts, et revenir à un filtre déjà consulté réaffiche instantanément.
 */

const ROOT = "admin" as const

function moduleKeys<TModule extends string>(module: TModule) {
  const all = [ROOT, module] as const
  return {
    all,
    list: (params: unknown) => [...all, "list", params] as const,
    detail: (id: number | string) => [...all, "detail", id] as const,
  }
}

export const MEMBERS_KEYS = moduleKeys("members")
export const GENEALOGY_KEYS = moduleKeys("genealogy")
export const PACKS_KEYS = moduleKeys("packs")
export const PRODUCTS_KEYS = moduleKeys("products")
export const CATEGORIES_KEYS = moduleKeys("categories")
export const ORDERS_KEYS = moduleKeys("orders")
export const LEDGER_KEYS = moduleKeys("ledger")

// ── Tranche 8c ──
export const DASHBOARD_KEYS = moduleKeys("dashboard")
export const COMMISSIONS_KEYS = moduleKeys("commissions")
export const ECARDS_KEYS = moduleKeys("ecards")
export const RENEWALS_KEYS = moduleKeys("renewals")
export const REPORTS_KEYS = moduleKeys("reports")
export const ADMIN_USERS_KEYS = moduleKeys("adminUsers")
