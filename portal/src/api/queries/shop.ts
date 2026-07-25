import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components, operations } from "../generated/schema"
import {
  ECARDS_KEYS,
  LEDGER_KEYS,
  ME_KEYS,
  NETWORK_KEYS,
  ORDERS_KEYS,
  SHOP_KEYS,
} from "./keys"

/**
 * Boutique et checkout (spec §7.1.4).
 *
 * DEUX PARCOURS QUI NE SE MÉLANGENT PAS :
 *  - ACTIVATION (membre INSCRIT) : le panier doit totaliser EXACTEMENT le palier du pack en
 *    POINTS, et le montant réglé est le PRIX DU PACK MOINS L'ACOMPTE d'inscription (D-037),
 *    pas la somme des prix du panier ;
 *  - ACHAT LIBRE (membre ACTIF) : le montant dû est la somme des prix DT, et l'opération n'a
 *    AUCUN effet sur l'arbre ni sur les points (D-005).
 *
 * Aucun de ces deux montants n'est calculé ici : le front affiche ce que le backend impose et
 * lui renvoie les codes d'e-cards. C'est le backend qui refuse si la somme ne tombe pas juste.
 */
export type Product = components["schemas"]["ProductResponseDto"]
export type PackOffer = components["schemas"]["PackOfferDto"]
export type Category = components["schemas"]["CategoryResponseDto"]
export type Order = components["schemas"]["OrderResponseDto"]
export type OrderPage = components["schemas"]["OrderPageResponseDto"]

export type ProductsQuery = NonNullable<
  operations["CatalogController_products"]["parameters"]["query"]
>
export type OrdersQuery = NonNullable<
  operations["OrdersController_mine"]["parameters"]["query"]
>

export function productsQueryOptions(query: ProductsQuery = {}) {
  return queryOptions({
    queryKey: SHOP_KEYS.list(query),
    queryFn: async () =>
      unwrap(await apiClient.GET("/shop/products", { params: { query } })),
  })
}

/**
 * Les packs proposés à l'activation. Route AFFILIÉ dédiée : `/admin/packs` est réservée aux
 * administrateurs, et elle porte un compteur de membres qui n'a pas à sortir ici.
 */
export function packsQueryOptions() {
  return queryOptions({
    queryKey: [...SHOP_KEYS.all, "packs"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/packs")),
  })
}

export function categoriesQueryOptions() {
  return queryOptions({
    queryKey: [...SHOP_KEYS.all, "categories"] as const,
    queryFn: async () => unwrap(await apiClient.GET("/shop/categories")),
  })
}

export function myOrdersQueryOptions(query: OrdersQuery) {
  return queryOptions({
    queryKey: ORDERS_KEYS.list(query),
    queryFn: async () =>
      unwrap(await apiClient.GET("/orders", { params: { query } })),
    placeholderData: (previous: OrderPage | undefined) => previous,
  })
}

export function myOrderQueryOptions(id: number) {
  return queryOptions({
    queryKey: ORDERS_KEYS.detail(id),
    queryFn: async () =>
      unwrap(await apiClient.GET("/orders/{id}", { params: { path: { id } } })),
  })
}

export interface CheckoutItem {
  productId: number
  quantity: number
}

/**
 * Un checkout change à peu près tout ce que le portail affiche : commandes, e-cards brûlées,
 * et — en activation — le statut du membre, ses points d'arbre, son réseau. On invalide donc
 * largement plutôt que d'énumérer finement : se tromper d'énumération laisse un écran mentir.
 */
function useInvalidateAfterCheckout() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ORDERS_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: ECARDS_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: ME_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: NETWORK_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: LEDGER_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: SHOP_KEYS.all }) // le stock a bougé
  }
}

/**
 * ACTIVATION : panier au palier EXACT en points, réglé par 1..n e-cards dont la somme vaut le
 * prix du pack moins l'acompte. Commande, e-cards, activation, arbre et stock committent
 * ensemble ou pas du tout (D-027) — un échec ne laisse rien derrière lui.
 */
export function useActivationCheckout() {
  const invalidate = useInvalidateAfterCheckout()

  return useMutation({
    mutationFn: async (body: {
      packId: number
      items: CheckoutItem[]
      ecardCodes: string[]
      shippingAddress?: string
    }) => unwrap(await apiClient.POST("/shop/checkout/activation", { body })),
    onSuccess: invalidate,
  })
}

/** ACHAT LIBRE (membre ACTIF) : aucun point, aucun effet sur l'arbre, aucun solde crédité. */
export function useFreeCheckout() {
  const invalidate = useInvalidateAfterCheckout()

  return useMutation({
    mutationFn: async (body: {
      items: CheckoutItem[]
      ecardCodes: string[]
      shippingAddress?: string
    }) => unwrap(await apiClient.POST("/shop/checkout/free", { body })),
    onSuccess: invalidate,
  })
}
