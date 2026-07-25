import { queryOptions } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import { REPORTS_KEYS } from "./keys"

export type SalesReport = components["schemas"]["SalesReportDto"]
export type ProductSalesRow = components["schemas"]["ProductSalesRowDto"]
export type OrdersByContextRow = components["schemas"]["OrdersByContextRowDto"]
export type ActivationsByPackRow = components["schemas"]["ActivationsByPackRowDto"]
export type CommissionsPeriodRow = components["schemas"]["CommissionsPeriodRowDto"]
export type CirculationReport = components["schemas"]["CirculationReportDto"]
export type TopAffiliateRow = components["schemas"]["TopAffiliateRowDto"]

export type ReportPeriod = NonNullable<
  operations["ReportsAdminController_sales"]["parameters"]["query"]
>

export function salesReportQueryOptions(query: ReportPeriod) {
  return queryOptions({
    queryKey: [...REPORTS_KEYS.all, "sales", query] as const,
    queryFn: async () =>
      unwrap(await apiClient.GET("/admin/reports/sales", { params: { query } })),
  })
}

export function activationsByPackQueryOptions(query: ReportPeriod) {
  return queryOptions({
    queryKey: [...REPORTS_KEYS.all, "activationsByPack", query] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/reports/activations-by-pack", {
          params: { query },
        }),
      ),
  })
}

export function commissionsReportQueryOptions(query: ReportPeriod) {
  return queryOptions({
    queryKey: [...REPORTS_KEYS.all, "commissions", query] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/reports/commissions", { params: { query } }),
      ),
  })
}

/** Sans période : « les dinars du système AUJOURD'HUI » est un état, pas un flux. */
export const circulationQueryOptions = queryOptions({
  queryKey: [...REPORTS_KEYS.all, "circulation"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/admin/reports/circulation")),
})

export function topAffiliatesQueryOptions(query: ReportPeriod & { limit?: number }) {
  return queryOptions({
    queryKey: [...REPORTS_KEYS.all, "topAffiliates", query] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/reports/top-affiliates", { params: { query } }),
      ),
  })
}
