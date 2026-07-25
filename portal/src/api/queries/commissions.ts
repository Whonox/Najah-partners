import { queryOptions } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import { COMMISSIONS_KEYS } from "./keys"

/**
 * MES commissions (spec §7.1, portail affilié).
 *
 * La ventilation détaillée vient du MÊME service backend que la supervision du back-office
 * (`CommissionExplainService`, D-047) : elle est rejouée par `settleWeek`, la fonction qu'a
 * exécutée le run, sur les mêmes entrées. L'affilié et le gestionnaire lisent donc mot pour
 * mot la même explication d'un même versement — condition pour que cet écran évite des
 * réclamations au lieu d'en fabriquer.
 */
export type MyCommissionRow = components["schemas"]["MyCommissionRowDto"]
export type MyCommissionPage = components["schemas"]["MyCommissionPageDto"]
export type RunMemberEvents = components["schemas"]["RunMemberEventsDto"]
export type RunEvent = components["schemas"]["RunEventDto"]

export type MyCommissionsQuery = NonNullable<
  operations["CommissionsPortalController_myRuns"]["parameters"]["query"]
>

export function myCommissionsQueryOptions(query: MyCommissionsQuery) {
  return queryOptions({
    queryKey: COMMISSIONS_KEYS.list(query),
    queryFn: async () =>
      unwrap(await apiClient.GET("/commissions/mine", { params: { query } })),
    placeholderData: (previous: MyCommissionPage | undefined) => previous,
  })
}

export function myRunEventsQueryOptions(runId: number) {
  return queryOptions({
    queryKey: COMMISSIONS_KEYS.detail(runId),
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/commissions/mine/{runId}", {
          params: { path: { runId } },
        }),
      ),
  })
}
