import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import { COMMISSIONS_KEYS, DASHBOARD_KEYS, LEDGER_KEYS, MEMBERS_KEYS } from "./keys"

export type RunSummary = components["schemas"]["RunSummaryDto"]
export type RunPage = components["schemas"]["RunPageDto"]
export type RunDetail = components["schemas"]["RunDetailDto"]
export type RunMemberRow = components["schemas"]["RunMemberRowDto"]
export type RunMemberPage = components["schemas"]["RunMemberPageDto"]
export type RunMemberEvents = components["schemas"]["RunMemberEventsDto"]
export type RunEvent = components["schemas"]["RunEventDto"]
export type PendingEvents = components["schemas"]["PendingEventsDto"]

export type RunsQuery = NonNullable<
  operations["CommissionsAdminController_listRuns"]["parameters"]["query"]
>

export function runsQueryOptions(query: RunsQuery) {
  return queryOptions({
    queryKey: COMMISSIONS_KEYS.list(query),
    queryFn: async () =>
      unwrap(await apiClient.GET("/admin/commissions/runs", { params: { query } })),
    placeholderData: (previous: RunPage | undefined) => previous,
  })
}

export function runQueryOptions(runId: number) {
  return queryOptions({
    queryKey: COMMISSIONS_KEYS.detail(runId),
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/commissions/runs/{runId}", {
          params: { path: { runId } },
        }),
      ),
  })
}

export function runMembersQueryOptions(runId: number, page: number, pageSize = 20) {
  return queryOptions({
    queryKey: [...COMMISSIONS_KEYS.detail(runId), "members", page, pageSize] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/commissions/runs/{runId}/members", {
          params: { path: { runId }, query: { page, pageSize } },
        }),
      ),
    placeholderData: (previous: RunMemberPage | undefined) => previous,
  })
}

/**
 * La chronologie d'un membre sur un run — l'écran qui explique un montant. Chargée à la
 * demande (à l'ouverture du détail d'un membre) : la précharger pour les 200 membres d'un run
 * ferait 200 requêtes pour une seule qu'on regardera.
 */
export function runMemberEventsQueryOptions(runId: number, memberId: number) {
  return queryOptions({
    queryKey: [...COMMISSIONS_KEYS.detail(runId), "events", memberId] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET(
          "/admin/commissions/runs/{runId}/members/{memberId}/events",
          { params: { path: { runId, memberId } } },
        ),
      ),
  })
}

/** Ce que le prochain run paiera : les événements pas encore réclamés. */
export const pendingEventsQueryOptions = queryOptions({
  queryKey: [...COMMISSIONS_KEYS.all, "pending"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/admin/commissions/pending")),
})

/**
 * Relance de secours (SUPER_ADMIN). Elle CRÉDITE des soldes : on invalide donc aussi le grand
 * livre, les membres et le tableau de bord — sans quoi l'écran afficherait encore les soldes
 * d'avant le run qu'on vient de lancer.
 *
 * Elle est idempotente côté serveur (réclamation `runId IS NULL`) : relancer une période déjà
 * réglée ne recrédite rien et renvoie `alreadyExecuted`.
 */
export function useRelaunchRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: { periodEnd?: string }) =>
      unwrap(await apiClient.POST("/admin/commissions/runs", { body })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: COMMISSIONS_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: LEDGER_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: MEMBERS_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all })
    },
  })
}

/**
 * Il n'existe VOLONTAIREMENT aucune mutation d'ANNULATION de run : le backend n'expose pas de
 * route. Annuler signifierait reprendre des dinars déjà crédités, donc peut-être déjà
 * transformés en e-cards `USED` — irréversibles (D-025). Point ouvert, non tranché.
 */
