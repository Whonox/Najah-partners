import { queryOptions } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components } from "../generated/schema"
import { GENEALOGY_KEYS } from "./keys"

export type TreeNode = components["schemas"]["TreeNodeDto"]

/**
 * Profondeur RAMENÉE à chaque requête. Deux niveaux sous la racine = 7 nœuds au plus : de
 * quoi lire une position d'un coup d'œil, tout en gardant la requête minuscule.
 *
 * Ne PAS augmenter pour « voir plus loin » : un arbre binaire DOUBLE à chaque niveau (le
 * maximum accepté par le backend, 8, vaut 511 nœuds), et le module doit rester utilisable
 * sur un réseau de plusieurs milliers de membres. La façon de voir plus loin est de
 * RECENTRER sur un nœud — ce que `hasLeftChild` / `hasRightChild` rendent possible sans
 * jamais deviner ce qu'il y a en dessous.
 */
export const TREE_DEPTH = 2

export function treeQueryOptions(memberId: number, depth = TREE_DEPTH) {
  return queryOptions({
    queryKey: [...GENEALOGY_KEYS.detail(memberId), depth] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/members/{memberId}/tree", {
          params: { path: { memberId }, query: { depth } },
        }),
      ),
    // Le sous-arbre précédent reste affiché pendant le chargement du suivant : sans ça,
    // chaque recentrage vide l'écran et l'admin perd le fil de sa descente.
    placeholderData: (previous: TreeNode | undefined) => previous,
  })
}
