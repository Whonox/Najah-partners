import { queryOptions } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import { LEDGER_KEYS, MEMBERS_KEYS } from "./keys"

/** Types GÉNÉRÉS depuis l'OpenAPI — aucun type d'API n'est recopié à la main. */
export type MemberListItem = components["schemas"]["MemberListItemDto"]
export type MemberPage = components["schemas"]["MemberPageDto"]
export type MemberDetail = components["schemas"]["MemberDetailDto"]
export type MemberRef = components["schemas"]["MemberRefDto"]
export type ActivationSnapshot = components["schemas"]["ActivationSnapshotDto"]
export type LedgerEntry = components["schemas"]["LedgerEntryResponseDto"]

/** Filtres de la liste : la forme exacte que le backend accepte, tirée de l'opération. */
export type MembersQuery = NonNullable<
  operations["MembersAdminController_list"]["parameters"]["query"]
>

export type MemberSortField = NonNullable<MembersQuery["sort"]>

export function membersQueryOptions(query: MembersQuery) {
  return queryOptions({
    queryKey: MEMBERS_KEYS.list(query),
    queryFn: async () =>
      unwrap(await apiClient.GET("/admin/members", { params: { query } })),
    // La liste précédente reste à l'écran pendant qu'on change de page ou de filtre : sans
    // ça, la table disparaît à chaque frappe de la recherche et l'écran clignote.
    placeholderData: (previous: MemberPage | undefined) => previous,
  })
}

export function memberQueryOptions(memberId: number) {
  return queryOptions({
    queryKey: MEMBERS_KEYS.detail(memberId),
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/members/{memberId}", {
          params: { path: { memberId } },
        }),
      ),
  })
}

/**
 * Historique des mouvements de SOLDE du membre (DINARS — le grand livre ne connaît que
 * l'argent). Rappel utile en lisant l'écran : consommer une e-card n'écrit RIEN ici
 * (D-025) — aucun solde ne bouge, l'e-card paie directement. Un membre peut donc avoir
 * réglé son activation sans qu'aucune ligne n'apparaisse.
 */
export function memberLedgerQueryOptions(
  memberId: number,
  page: number,
  pageSize = 10,
) {
  return queryOptions({
    queryKey: [...LEDGER_KEYS.detail(memberId), page, pageSize] as const,
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/ledger/members/{memberId}/history", {
          params: { path: { memberId }, query: { page, pageSize } },
        }),
      ),
  })
}

/**
 * URL de l'image de la pièce d'identité. Elle N'EST PAS utilisable dans un `<img src>` :
 * la route exige un en-tête `Authorization`, qu'un navigateur n'envoie pas sur le
 * chargement d'une image. On la charge donc en binaire (`useIdDocument`) pour en faire une
 * URL d'objet locale.
 */
export const idDocumentPath = (memberId: number) =>
  `/admin/members/${memberId}/id-document`
