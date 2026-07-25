/**
 * Clés de cache TanStack Query, déclarées UNE fois.
 *
 *     ["portal", <module>]                   → toutes les données du module
 *     ["portal", <module>, "list", <params>] → une liste, avec ses filtres
 *     ["portal", <module>, "detail", <id>]   → une fiche
 *
 * La HIÉRARCHIE fait tout le travail d'invalidation : TanStack compare les clés par PRÉFIXE,
 * donc invalider `ECARDS_KEYS.all` rafraîchit la liste ET la fiche sans énumérer les écrans
 * concernés — énumération qu'on oublierait de compléter au premier écran ajouté.
 *
 * Racine `portal` et non `admin` : les deux applications ne partagent ni cache ni session,
 * mais elles partagent des conventions, et une racine explicite évite qu'un copier-coller
 * d'écran fasse silencieusement collision un jour.
 */

const ROOT = "portal" as const

function moduleKeys<TModule extends string>(module: TModule) {
  const all = [ROOT, module] as const
  return {
    all,
    list: (params: unknown) => [...all, "list", params] as const,
    detail: (id: number | string) => [...all, "detail", id] as const,
  }
}

/** Mon profil et mon tableau de bord : tout ce qui décrit MON compte. */
export const ME_KEYS = moduleKeys("me")
export const ECARDS_KEYS = moduleKeys("ecards")
export const SHOP_KEYS = moduleKeys("shop")
export const ORDERS_KEYS = moduleKeys("orders")
export const NETWORK_KEYS = moduleKeys("network")
export const COMMISSIONS_KEYS = moduleKeys("commissions")
export const LEDGER_KEYS = moduleKeys("ledger")
export const RENEWALS_KEYS = moduleKeys("renewals")
