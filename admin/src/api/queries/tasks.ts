import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components } from "../generated/schema"
import {
  COMMISSIONS_KEYS,
  DASHBOARD_KEYS,
  ECARDS_KEYS,
  MEMBERS_KEYS,
  RENEWALS_KEYS,
} from "./keys"

/**
 * Les DEUX files de tâches de l'administration. Elles se ressemblent (une liste, un bouton) et
 * sont pourtant de nature opposée — c'est le point le plus important à ne pas confondre :
 *
 *  — **vérification d'identité (D-018)** : NON BLOQUANTE. Le badge informe. Un membre PENDING ou
 *    REJECTED s'inscrit, s'active, perçoit et renouvelle exactement comme un membre VERIFIED ;
 *  — **validation de renouvellement (D-038)** : BLOQUANTE. Tant que l'admin n'a pas validé, un
 *    membre gelé reste gelé et ne perçoit RIEN, même s'il a déjà payé.
 */

export type PendingRenewal = components["schemas"]["PendingRenewalDto"]
export type VerificationResult = components["schemas"]["VerificationResultDto"]

/** File des renouvellements payés en attente (plus anciens d'abord). */
export const pendingRenewalsQueryOptions = queryOptions({
  queryKey: [...RENEWALS_KEYS.all, "pending"] as const,
  queryFn: async () => unwrap(await apiClient.GET("/admin/renewals/pending")),
})

/**
 * Valider un renouvellement : réactive un membre gelé (nouvelle baseline, carry-over d'avant le
 * gel CONSERVÉ — D-034) ou repousse seulement l'échéance d'un ACTIF.
 *
 * Invalide aussi les commissions : à partir de maintenant, les événements de ce membre naissent
 * éligibles, et le « prochain run » ne dit plus la même chose.
 *
 * Il n'existe AUCUNE mutation de refus : les e-cards sont déjà brûlées et `USED` est
 * irréversible (D-038, point ouvert non tranché).
 */
export function useValidateRenewal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (paymentId: number) =>
      unwrap(
        await apiClient.POST("/admin/renewals/{paymentId}/validate", {
          params: { path: { paymentId } },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RENEWALS_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: MEMBERS_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: COMMISSIONS_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: ECARDS_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all })
    },
  })
}

/**
 * Statuer sur une vérification d'identité (SUPER_ADMIN + MANAGER). Le motif est OBLIGATOIRE au
 * rejet et REFUSÉ à la validation — contrôlé côté serveur, et jusque dans une contrainte de base.
 *
 * N'invalide QUE les membres et le tableau de bord (le compteur de tâches) : rien d'autre ne
 * change, puisque la vérification ne bloque rien.
 */
export function useDecideVerification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: {
      memberId: number
      status: "VERIFIED" | "REJECTED"
      reason?: string
    }) =>
      unwrap(
        await apiClient.POST("/admin/members/{memberId}/verification", {
          params: { path: { memberId: variables.memberId } },
          body: {
            status: variables.status,
            ...(variables.reason ? { reason: variables.reason } : {}),
          },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MEMBERS_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all })
    },
  })
}
