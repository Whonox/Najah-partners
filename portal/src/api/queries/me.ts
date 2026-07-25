import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import { LEDGER_KEYS, ME_KEYS, RENEWALS_KEYS } from "./keys"

/**
 * MON compte (spec §7.1.1 et §7.1.7).
 *
 * Toutes les routes sont sous `/members/me` : aucune ne porte d'identifiant, la portée vient
 * du token. Il n'existe donc, depuis le portail, aucun appel capable de lire le compte d'un
 * autre affilié — ce n'est pas une précaution d'écriture, c'est la forme même du contrat.
 */
export type MemberProfile = components["schemas"]["MemberProfileDto"]
export type MemberDashboard = components["schemas"]["MemberDashboardDto"]
export type MemberPackSnapshot = components["schemas"]["MemberPackSnapshotDto"]
export type MemberRenewalState = components["schemas"]["MemberRenewalStateDto"]
export type LedgerEntry = components["schemas"]["LedgerEntryResponseDto"]
export type LedgerHistoryPage = components["schemas"]["LedgerHistoryPageDto"]
export type MembershipPayment =
  components["schemas"]["MembershipPaymentResponseDto"]

export type LedgerQuery = NonNullable<
  operations["MembersPortalController_ledgerHistory"]["parameters"]["query"]
>

export function profileQueryOptions() {
  return queryOptions({
    queryKey: ME_KEYS.detail("profile"),
    queryFn: async () => unwrap(await apiClient.GET("/members/me")),
  })
}

export function dashboardQueryOptions() {
  return queryOptions({
    queryKey: ME_KEYS.detail("dashboard"),
    queryFn: async () => unwrap(await apiClient.GET("/members/me/dashboard")),
  })
}

export function myLedgerQueryOptions(query: LedgerQuery) {
  return queryOptions({
    queryKey: LEDGER_KEYS.list(query),
    queryFn: async () =>
      unwrap(await apiClient.GET("/members/me/ledger", { params: { query } })),
    placeholderData: (previous: LedgerHistoryPage | undefined) => previous,
  })
}

export function myRenewalsQueryOptions() {
  return queryOptions({
    queryKey: RENEWALS_KEYS.list({}),
    queryFn: async () => unwrap(await apiClient.GET("/members/me/renewals")),
  })
}

/**
 * Profil : NOM et PRÉNOM uniquement.
 *
 * Le corps accepté ne comporte ni e-mail ni téléphone (D-049) — ce sont des identifiants de
 * connexion, et aucun canal de confirmation n'existe (D-011). Ce n'est pas un champ grisé à
 * l'écran : le type généré ne les contient pas, donc les envoyer ne compilerait pas.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: { firstName?: string; lastName?: string }) =>
      unwrap(await apiClient.PATCH("/members/me", { body })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_KEYS.all })
    },
  })
}

/**
 * Changement de mot de passe. Le backend RÉVOQUE toutes les sessions au passage : l'appelant
 * doit donc enchaîner sur une déconnexion propre plutôt que laisser l'écran croire qu'il est
 * encore connecté avec un jeton qui ne vaut plus rien.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) =>
      unwrap(await apiClient.POST("/members/me/password", { body })),
  })
}

/**
 * Renouvellement annuel (D-038), TEMPS 1 : le paiement.
 *
 * Il ne dégèle personne — il crée une demande en attente de validation par l'administration.
 * L'écran doit le dire, sinon un membre gelé croira avoir retrouvé ses droits en payant.
 */
export function usePayRenewal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: { ecardCodes: string[] }) =>
      unwrap(await apiClient.POST("/members/me/renewal", { body })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ME_KEYS.all })
      await queryClient.invalidateQueries({ queryKey: RENEWALS_KEYS.all })
    },
  })
}
