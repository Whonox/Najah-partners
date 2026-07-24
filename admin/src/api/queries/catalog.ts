import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "../client"
import { unwrap } from "../error"
import type { components } from "../generated/schema"
import { CATEGORIES_KEYS, PRODUCTS_KEYS } from "./keys"

export type Product = components["schemas"]["ProductResponseDto"]
export type Category = components["schemas"]["CategoryResponseDto"]
export type CreateProductBody = components["schemas"]["CreateProductDto"]
export type UpdateProductBody = components["schemas"]["UpdateProductDto"]
export type CreateCategoryBody = components["schemas"]["CreateCategoryDto"]
export type UpdateCategoryBody = components["schemas"]["UpdateCategoryDto"]

/** Vue ADMIN : tout le catalogue, y compris les produits inactifs et masqués de la vitrine. */
export function productsQueryOptions(categoryId?: number) {
  return queryOptions({
    queryKey: PRODUCTS_KEYS.list({ categoryId }),
    queryFn: async () =>
      unwrap(
        await apiClient.GET("/admin/shop/products", {
          params: { query: categoryId ? { categoryId } : {} },
        }),
      ),
  })
}

export const categoriesQueryOptions = queryOptions({
  queryKey: CATEGORIES_KEYS.all,
  queryFn: async () => unwrap(await apiClient.GET("/admin/shop/categories")),
})

function useInvalidateProducts() {
  const queryClient = useQueryClient()
  // Le préfixe suffit : toutes les listes, quel que soit leur filtre de catégorie.
  return () => queryClient.invalidateQueries({ queryKey: PRODUCTS_KEYS.all })
}

export function useCreateProduct() {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: async (body: CreateProductBody) =>
      unwrap(await apiClient.POST("/admin/shop/products", { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateProduct() {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: async (variables: { id: number; body: UpdateProductBody }) =>
      unwrap(
        await apiClient.PATCH("/admin/shop/products/{id}", {
          params: { path: { id: variables.id } },
          body: variables.body,
        }),
      ),
    onSuccess: invalidate,
  })
}

/**
 * Une catégorie touche aussi les produits : la table les groupe par catégorie et le filtre
 * s'en nourrit. On invalide donc les deux.
 */
function useInvalidateCategories() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: CATEGORIES_KEYS.all })
    await queryClient.invalidateQueries({ queryKey: PRODUCTS_KEYS.all })
  }
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: async (body: CreateCategoryBody) =>
      unwrap(await apiClient.POST("/admin/shop/categories", { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: async (variables: { id: number; body: UpdateCategoryBody }) =>
      unwrap(
        await apiClient.PATCH("/admin/shop/categories/{id}", {
          params: { path: { id: variables.id } },
          body: variables.body,
        }),
      ),
    onSuccess: invalidate,
  })
}

/**
 * Une catégorie VIDE se supprime (le backend refuse les autres) — contrairement à un produit,
 * qu'une `OrderLine` référence à vie et qui ne se retire jamais que par désactivation.
 */
export function useDeleteCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(
        await apiClient.DELETE("/admin/shop/categories/{id}", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  })
}
