import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components } from "../generated/schema"
import { ECARDS_KEYS, LEDGER_KEYS, ME_KEYS } from "./keys"

/**
 * MES e-cards (spec §7.1.3).
 *
 * ═══ LE TYPE LUI-MÊME INTERDIT DE RÉAFFICHER UN CODE (D-048) ═══
 * `Ecard` est généré depuis un DTO backend qui NE PORTE PAS de champ `code` : écrire
 * `ecard.code` dans un composant de liste ne compile pas. La règle « un code ne se révèle
 * qu'une fois » n'est donc pas une consigne qu'on peut oublier, c'est une erreur de
 * compilation.
 *
 * La seule exception de tout le module est `useCreateEcard`, dont la réponse porte le code —
 * une seule fois, pour que le membre puisse le noter ou le transmettre.
 */
export type Ecard = components["schemas"]["EcardResponseDto"]
export type CreatedEcard = components["schemas"]["CreatedEcardResponseDto"]
export type EcardVerification =
  components["schemas"]["EcardVerificationResponseDto"]

export function myEcardsQueryOptions() {
  return queryOptions({
    queryKey: ECARDS_KEYS.list({}),
    queryFn: async () => unwrap(await apiClient.GET("/ecards/mine")),
  })
}

/**
 * CRÉATION — la seule réponse de tout le portail qui porte un code en clair.
 *
 * Il est affiché une fois puis perdu : on ne le met donc NI dans le cache TanStack
 * (`ECARDS_KEYS`, qui se recharge à volonté), NI dans un état persisté. L'appelant le tient
 * dans un état local, le temps de la boîte de dialogue, et cet état est vidé à la fermeture.
 *
 * Créer une e-card DÉBITE le solde immédiatement (D-025) : le grand livre et le tableau de
 * bord changent, d'où leur invalidation.
 */
export function useCreateEcard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: { valueDt: number }) =>
      unwrap(await apiClient.POST("/ecards", { body })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ECARDS_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: ME_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: LEDGER_KEYS.all })
    },
  })
}

/**
 * Vérification d'un code REÇU : validité et valeur, sans le consommer.
 *
 * Volontairement une MUTATION et non une requête : le résultat ne doit pas être mis en cache
 * — un code saisi est de la valeur au porteur, et le garder en mémoire du client après
 * l'écran le ferait survivre à la navigation. Le backend limite par ailleurs le débit
 * (20 essais/minute) : ce n'est pas un champ qu'on interroge à chaque frappe.
 */
export function useVerifyEcard() {
  return useMutation({
    mutationFn: async (body: { code: string }) =>
      unwrap(await apiClient.POST("/ecards/verify", { body })),
  })
}

/**
 * Prolonger l'échéance d'une de MES cartes ACTIVE (D-026). Prolonger ne crée aucune valeur :
 * cela retarde le remboursement que l'expiration m'aurait rendu.
 */
export function useExtendEcard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: { id: number; days: number }) =>
      unwrap(
        await apiClient.POST("/ecards/{id}/extend", {
          params: { path: { id: variables.id } },
          body: { days: variables.days },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ECARDS_KEYS.all })
    },
  })
}
