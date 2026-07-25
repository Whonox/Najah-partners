import { queryOptions } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import { DASHBOARD_KEYS } from "./keys"

/** Types GÉNÉRÉS depuis l'OpenAPI — aucun type d'API n'est recopié à la main. */
export type Dashboard = components["schemas"]["DashboardDto"]
export type DashboardSeriesPoint = components["schemas"]["DashboardSeriesPointDto"]
export type DashboardPackRow = components["schemas"]["DashboardPackRowDto"]

type DashboardQuery = NonNullable<
  operations["DashboardAdminController_overview"]["parameters"]["query"]
>

/**
 * Le tableau de bord tient en UN appel : douze compteurs répartis sur douze requêtes
 * donneraient douze états de chargement et douze façons d'échouer à moitié, sur la page qui
 * s'ouvre à chaque connexion.
 */
export function dashboardQueryOptions(days?: number) {
  const query: DashboardQuery = days ? { days } : {}
  return queryOptions({
    queryKey: DASHBOARD_KEYS.list(query),
    queryFn: async () =>
      unwrap(await apiClient.GET("/admin/dashboard", { params: { query } })),
  })
}
