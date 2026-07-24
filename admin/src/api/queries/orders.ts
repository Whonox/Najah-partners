import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import type { ShipmentStatus } from "../enums"
import { ORDERS_KEYS } from "./keys"

export type Order = components["schemas"]["OrderResponseDto"]
export type OrderPage = components["schemas"]["OrderPageResponseDto"]
export type OrderLine = components["schemas"]["OrderLineResponseDto"]

export type OrdersQuery = NonNullable<
  operations["OrdersAdminController_list"]["parameters"]["query"]
>

export function ordersQueryOptions(query: OrdersQuery) {
  return queryOptions({
    queryKey: ORDERS_KEYS.list(query),
    queryFn: async () =>
      unwrap(await apiClient.GET("/admin/orders", { params: { query } })),
    placeholderData: (previous: OrderPage | undefined) => previous,
  })
}

export function orderQueryOptions(id: number) {
  return queryOptions({
    queryKey: ORDERS_KEYS.detail(id),
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/orders/{id}", { params: { path: { id } } }),
      ),
  })
}

/**
 * SEULE écriture du module Commandes : l'avancement logistique. Elle ne touche à AUCUNE
 * valeur — la commande a été réglée par e-card au checkout, et une commande payée ne se
 * modifie pas.
 *
 * Il n'existe VOLONTAIREMENT aucune mutation d'annulation : les e-cards sont déjà brûlées et
 * `USED` est irréversible (règle e-card) — que deviendrait leur valeur ? La question n'est
 * pas tranchée, donc aucun chemin d'annulation n'est construit.
 *
 * L'invalidation porte sur TOUT le module : le détail change, mais la liste aussi (la colonne
 * d'expédition et le filtre « file de préparation » en dépendent). Le préfixe les couvre tous.
 */
export function useUpdateShipment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables: { id: number; status: ShipmentStatus }) =>
      unwrap(
        await apiClient.PATCH("/admin/orders/{id}/shipment", {
          params: { path: { id: variables.id } },
          body: { status: variables.status },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ORDERS_KEYS.all }),
  })
}
