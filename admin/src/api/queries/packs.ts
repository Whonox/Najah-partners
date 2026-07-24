import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components } from "../generated/schema"
import { MEMBERS_KEYS, PACKS_KEYS } from "./keys"

export type Pack = components["schemas"]["PackResponseDto"]
export type CreatePackBody = components["schemas"]["CreatePackDto"]
export type UpdatePackBody = components["schemas"]["UpdatePackDto"]

export const packsQueryOptions = queryOptions({
  queryKey: PACKS_KEYS.all,
  queryFn: async () => unwrap(await apiClient.GET("/admin/packs")),
})

/**
 * Les deux mutations invalident les packs ET les membres : la liste des membres affiche le
 * nom du pack de chacun, et le filtre « pack » se peuple depuis cette même liste. Renommer
 * un pack sans invalider les membres laisserait l'ancien nom à l'écran jusqu'au prochain
 * rechargement — un back-office qui ment sur ce qu'il vient d'enregistrer.
 */
function useInvalidatePacks() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: PACKS_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: MEMBERS_KEYS.all })
  }
}

export function useCreatePack() {
  const invalidate = useInvalidatePacks()

  return useMutation({
    mutationFn: async (body: CreatePackBody) =>
      unwrap(await apiClient.POST("/admin/packs", { body })),
    onSuccess: invalidate,
  })
}

export function useUpdatePack() {
  const invalidate = useInvalidatePacks()

  return useMutation({
    mutationFn: async (variables: { id: number; body: UpdatePackBody }) =>
      unwrap(
        await apiClient.PATCH("/admin/packs/{id}", {
          params: { path: { id: variables.id } },
          body: variables.body,
        }),
      ),
    onSuccess: invalidate,
  })
}

/**
 * Il n'existe VOLONTAIREMENT aucune mutation de suppression : le backend n'expose pas de
 * route, parce que `Member.packId` et `Member.activationSnapshot` dépendent des packs à vie.
 * Retirer un pack de la vente = le désactiver (`useUpdatePack({ active: false })`).
 */
