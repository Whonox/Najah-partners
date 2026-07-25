import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import { DASHBOARD_KEYS, LEDGER_KEYS, MEMBERS_KEYS, REPORTS_KEYS } from "./keys"

export type BalanceRow = components["schemas"]["BalanceRowDto"]
export type BalancePage = components["schemas"]["BalancePageDto"]
export type MovementRow = components["schemas"]["MovementRowDto"]
export type MovementPage = components["schemas"]["MovementPageDto"]

export type BalancesQuery = NonNullable<
  operations["LedgerAdminController_balances"]["parameters"]["query"]
>
export type BalanceSortField = NonNullable<BalancesQuery["sort"]>
export type MovementsQuery = NonNullable<
  operations["LedgerAdminController_movements"]["parameters"]["query"]
>

export function balancesQueryOptions(query: BalancesQuery) {
  return queryOptions({
    queryKey: [...LEDGER_KEYS.all, "balances", query] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/admin/ledger/balances", { params: { query } })),
    placeholderData: (previous: BalancePage | undefined) => previous,
  })
}

export function movementsQueryOptions(query: MovementsQuery) {
  return queryOptions({
    queryKey: [...LEDGER_KEYS.all, "movements", query] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/admin/ledger/movements", { params: { query } })),
    placeholderData: (previous: MovementPage | undefined) => previous,
  })
}

/**
 * Les deux écritures du grand livre. Elles bougent un solde, donc elles invalident LARGEMENT :
 * le registre, le journal, la fiche du membre, sa liste, les rapports et le tableau de bord
 * (« dinars en circulation ») affichent tous ce même solde. Invalider seulement le registre
 * laisserait la fiche membre afficher l'ancien montant juste après l'avoir ajusté.
 */
function useInvalidateBalances() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: LEDGER_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: MEMBERS_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: REPORTS_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all })
  }
}

/** Ajustement manuel (SUPER_ADMIN + MANAGER, D-017b) — motif obligatoire, tracé. */
export function useAdjustBalance() {
  const invalidate = useInvalidateBalances()

  return useMutation({
    mutationFn: async (variables: {
      memberId: number
      amountDt: number
      reason: string
    }) =>
      unwrap(
        await apiClient.POST("/admin/ledger/members/{memberId}/adjustment", {
          params: { path: { memberId: variables.memberId } },
          body: { amountDt: variables.amountDt, reason: variables.reason },
        }),
      ),
    onSuccess: invalidate,
  })
}

/**
 * GENÈSE de solde (SUPER_ADMIN SEUL, D-017b) : elle CRÉE de la valeur ex nihilo. C'est
 * l'opération la plus sensible de la plateforme — d'où le motif obligatoire côté serveur ET la
 * confirmation renforcée côté écran.
 */
export function useGenesisBalance() {
  const invalidate = useInvalidateBalances()

  return useMutation({
    mutationFn: async (variables: {
      memberId: number
      amountDt: number
      reason: string
    }) =>
      unwrap(
        await apiClient.POST("/admin/ledger/members/{memberId}/genesis", {
          params: { path: { memberId: variables.memberId } },
          body: { amountDt: variables.amountDt, reason: variables.reason },
        }),
      ),
    onSuccess: invalidate,
  })
}
