import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components } from "../generated/schema"

/** Type GÉNÉRÉ depuis l'OpenAPI du backend — aucun type d'API n'est recopié à la main. */
export type Setting = components["schemas"]["SettingResponseDto"]

export const SETTINGS_QUERY_KEY = ["admin", "settings"] as const

export const settingsQueryOptions = queryOptions({
  queryKey: SETTINGS_QUERY_KEY,
  queryFn: async () => unwrap(await apiClient.GET("/admin/settings")),
})

/**
 * Modification d'un paramètre (SUPER_ADMIN côté backend). La liste est invalidée après succès :
 * on réaffiche ce que le serveur a réellement enregistré, jamais ce qu'on croit avoir envoyé.
 */
export function useUpdateSetting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: { key: string; value: string }) =>
      unwrap(
        await apiClient.PATCH("/admin/settings/{key}", {
          params: { path: { key: variables.key } },
          body: { value: variables.value },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
  })
}
