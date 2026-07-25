import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import { DASHBOARD_KEYS, ECARDS_KEYS, LEDGER_KEYS, MEMBERS_KEYS, REPORTS_KEYS } from "./keys"

/**
 * E-cards côté back-office (§7.2.9).
 *
 * ═══ LE TYPE LUI-MÊME INTERDIT D'AFFICHER UN CODE ═══
 * `EcardAdminRow` est généré depuis un DTO backend qui NE PORTE PAS de champ `code` : écrire
 * `ecard.code` dans un composant ne compile pas. La règle « ne jamais afficher un code en clair »
 * n'est donc pas une consigne qu'on peut oublier, c'est une erreur de compilation.
 *
 * La seule exception de tout le module est `useGenesisEcard`, dont la réponse porte le code —
 * une seule fois, pour qu'il puisse être transmis (voir le composant de genèse).
 */
export type EcardAdminRow = components["schemas"]["EcardAdminRowDto"]
export type EcardAdminPage = components["schemas"]["EcardAdminPageDto"]
export type EcardAdminDetail = components["schemas"]["EcardAdminDetailDto"]
export type GenesisEcardResponse = components["schemas"]["GenesisEcardResponseDto"]

export type EcardsQuery = NonNullable<
  operations["EcardsAdminController_list"]["parameters"]["query"]
>
export type EcardSortField = NonNullable<EcardsQuery["sort"]>

export function ecardsQueryOptions(query: EcardsQuery) {
  return queryOptions({
    queryKey: ECARDS_KEYS.list(query),
    queryFn: async () =>
      unwrap(await apiClient.GET("/admin/ecards", { params: { query } })),
    placeholderData: (previous: EcardAdminPage | undefined) => previous,
  })
}

export function ecardQueryOptions(id: number) {
  return queryOptions({
    queryKey: ECARDS_KEYS.detail(id),
    queryFn: async () =>
      unwrap(await apiClient.GET("/admin/ecards/{id}", { params: { path: { id } } })),
  })
}

/**
 * Révoquer et prolonger touchent la VALEUR : la révocation recrédite le créateur (donc son
 * solde bouge, donc le grand livre et le tableau de bord aussi). La prolongation, elle, ne
 * déplace rien — mais elle repousse le remboursement à venir, ce qui change les échéances
 * affichées.
 */
function useInvalidateEcards(alsoBalances: boolean) {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ECARDS_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all })
    if (alsoBalances) {
      await queryClient.invalidateQueries({ queryKey: LEDGER_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: MEMBERS_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: REPORTS_KEYS.all })
    }
  }
}

/** Révocation (SUPER_ADMIN + MANAGER) : la valeur est RECRÉDITÉE au créateur. Motif obligatoire. */
export function useRevokeEcard() {
  const invalidate = useInvalidateEcards(true)

  return useMutation({
    mutationFn: async (variables: { id: number; reason: string }) =>
      unwrap(
        await apiClient.POST("/admin/ecards/{id}/revoke", {
          params: { path: { id: variables.id } },
          body: { reason: variables.reason },
        }),
      ),
    onSuccess: invalidate,
  })
}

/** Prolongation d'échéance (D-026), bornée à 365 jours par le backend. */
export function useExtendEcard() {
  const invalidate = useInvalidateEcards(false)

  return useMutation({
    mutationFn: async (variables: { id: number; days: number }) =>
      unwrap(
        await apiClient.POST("/admin/ecards/{id}/extend", {
          params: { path: { id: variables.id } },
          body: { days: variables.days },
        }),
      ),
    onSuccess: invalidate,
  })
}

/**
 * GENÈSE (SUPER_ADMIN SEUL) : crée de la valeur ex nihilo. La réponse contient le code EN
 * CLAIR — la seule de toute l'API admin. Il est affiché une fois puis perdu : on ne le met donc
 * NI dans le cache TanStack (`ECARDS_KEYS`), ni dans un état persisté. L'appelant le tient dans
 * un état local, le temps de la boîte de dialogue.
 */
export function useGenesisEcard() {
  const invalidate = useInvalidateEcards(false)

  return useMutation({
    mutationFn: async (variables: {
      valueDt: number
      expirationDays?: number
      reason: string
    }) => unwrap(await apiClient.POST("/admin/ecards/genesis", { body: variables })),
    onSuccess: invalidate,
  })
}
