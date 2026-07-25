import { queryOptions } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import { NETWORK_KEYS } from "./keys"

/**
 * MON réseau (spec §7.1.5 et §7.1.6).
 *
 * L'arbre est chargé BORNÉ (deux niveaux par défaut) et la descente est un RECENTRAGE — une
 * nouvelle requête sur un autre nœud —, jamais un dépliage cumulatif : un sous-arbre peut
 * compter des milliers de membres, et le charger entier pour en montrer trois serait payer
 * l'arbre pour rien à chaque clic. Même approche qu'en généalogie côté back-office (T8b).
 */
export type TreeNode = components["schemas"]["TreeNodeDto"]
export type DownlineRow = components["schemas"]["DownlineRowDto"]
export type DownlinePage = components["schemas"]["DownlinePageDto"]

export type DownlinesQuery = NonNullable<
  operations["MembersPortalController_downlines"]["parameters"]["query"]
>
export type TreeQuery = NonNullable<
  operations["MembersController_tree"]["parameters"]["query"]
>

/**
 * MON sous-arbre. La route ne prend pas d'identifiant : elle part TOUJOURS de moi. Le
 * recentrage sur un downline se fait donc côté écran, en descendant dans les nœuds déjà
 * ramenés — ce que la profondeur demandée rend possible sans requête supplémentaire.
 */
export function myTreeQueryOptions(query: TreeQuery = {}) {
  return queryOptions({
    queryKey: NETWORK_KEYS.list({ tree: query }),
    queryFn: async () =>
      unwrap(await apiClient.GET("/members/me/tree", { params: { query } })),
  })
}

export function myDownlinesQueryOptions(query: DownlinesQuery) {
  return queryOptions({
    queryKey: NETWORK_KEYS.list({ downlines: query }),
    queryFn: async () =>
      unwrap(await apiClient.GET("/members/me/downlines", { params: { query } })),
    placeholderData: (previous: DownlinePage | undefined) => previous,
  })
}
