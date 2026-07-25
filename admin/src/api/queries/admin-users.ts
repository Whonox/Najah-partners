import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components } from "../generated/schema"
import { ADMIN_USERS_KEYS } from "./keys"

export type AdminUser = components["schemas"]["AdminUserDto"]
export type AdminSessions = components["schemas"]["AdminSessionsDto"]
export type AdminSession = components["schemas"]["AdminSessionDto"]
export type CreateAdminUserBody = components["schemas"]["CreateAdminUserDto"]
export type UpdateAdminUserBody = components["schemas"]["UpdateAdminUserDto"]

export const adminUsersQueryOptions = queryOptions({
  queryKey: ADMIN_USERS_KEYS.all,
  queryFn: async () => unwrap(await apiClient.GET("/admin/admin-users")),
})

/**
 * Journal des SESSIONS d'un compte, reconstitué depuis les jetons de rafraîchissement. Il ne
 * contient PAS les tentatives échouées (rien ne les enregistre en base) — la réponse le dit
 * explicitement, et l'écran le répète : une liste vide ne veut pas dire « aucun incident ».
 */
export function adminSessionsQueryOptions(adminUserId: number) {
  return queryOptions({
    queryKey: [...ADMIN_USERS_KEYS.detail(adminUserId), "sessions"] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/admin-users/{adminUserId}/sessions", {
          params: { path: { adminUserId } },
        }),
      ),
  })
}

function useInvalidateAdminUsers() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEYS.all })
  }
}

export function useCreateAdminUser() {
  const invalidate = useInvalidateAdminUsers()

  return useMutation({
    mutationFn: async (body: CreateAdminUserBody) =>
      unwrap(await apiClient.POST("/admin/admin-users", { body })),
    onSuccess: invalidate,
  })
}

/**
 * Modification (nom, rôle, activation). Le backend REFUSE de désactiver ou de dégrader le
 * dernier SUPER_ADMIN actif, et refuse qu'un admin se le fasse à lui-même : l'écran masque ces
 * boutons, mais c'est le serveur qui garantit qu'on ne verrouille pas la plateforme.
 */
export function useUpdateAdminUser() {
  const invalidate = useInvalidateAdminUsers()

  return useMutation({
    mutationFn: async (variables: { id: number; body: UpdateAdminUserBody }) =>
      unwrap(
        await apiClient.PATCH("/admin/admin-users/{adminUserId}", {
          params: { path: { adminUserId: variables.id } },
          body: variables.body,
        }),
      ),
    onSuccess: invalidate,
  })
}

/**
 * Réinitialisation de mot de passe : le SUPER_ADMIN POSE la nouvelle valeur et la transmet hors
 * plateforme (aucun envoi d'e-mail n'existe — D-011). Les sessions du compte sont révoquées.
 */
export function useResetAdminPassword() {
  const invalidate = useInvalidateAdminUsers()

  return useMutation({
    mutationFn: async (variables: { id: number; password: string }) =>
      unwrap(
        await apiClient.POST("/admin/admin-users/{adminUserId}/password", {
          params: { path: { adminUserId: variables.id } },
          body: { password: variables.password },
        }),
      ),
    onSuccess: invalidate,
  })
}

/**
 * Il n'existe VOLONTAIREMENT aucune mutation de SUPPRESSION : un compte admin est référencé à
 * vie par ce qu'il a validé (renouvellements, e-cards de genèse, vérifications d'identité). On
 * désactive — la trace de qui a fait quoi doit survivre au départ de la personne.
 *
 * Et aucune matrice de PERMISSIONS : les rôles sont un enum, les droits vivent dans les guards
 * du backend. Point ouvert non tranché (docs/decisions.md), donc rien d'inventé ici.
 */
