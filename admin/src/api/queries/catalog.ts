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

/**
 * PHOTOS D'UN PRODUIT (D-054, D-059, précisé par D-062).
 *
 * ═══ ON NE MANIPULE QUE DES POSITIONS ═══
 * Le contrat ne rend plus les chemins de stockage, seulement `imageCount` : une photo se
 * désigne par sa POSITION, aussi bien pour l'afficher (`/shop/products/:id/images/:index`) que
 * pour la retirer ou la réordonner. Il n'y a donc aucun chemin à transporter, à stocker en
 * état local, ni à concaténer dans une URL — ce qui rend la faute impossible plutôt
 * qu'improbable.
 *
 * ═══ CHAQUE APPEL REND LE PRODUIT ENTIER ═══
 * Dépôt, retrait et réordonnancement renvoient le produit à jour : l'écran n'a jamais à
 * recomposer l'état après coup, il réinvalide et relit. Un compteur d'images reconstruit
 * localement finirait par mentir dès qu'un dépôt échoue à moitié.
 */
export function useAddProductImage() {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: async (variables: { id: number; file: File }) =>
      unwrap(
        await apiClient.POST("/admin/shop/products/{id}/images", {
          params: { path: { id: variables.id } },
          // `Content-Type: null` est nécessaire : c'est au navigateur de poser l'en-tête avec
          // sa frontière multipart. L'écrire nous-mêmes produirait un corps illisible.
          body: { image: variables.file as unknown as string },
          bodySerializer: (body: { image: unknown }) => {
            const data = new FormData()
            data.append("image", body.image as File)
            return data
          },
          headers: { "Content-Type": null },
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useRemoveProductImage() {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: async (variables: { id: number; index: number }) =>
      unwrap(
        await apiClient.DELETE("/admin/shop/products/{id}/images/{index}", {
          params: { path: { id: variables.id, index: variables.index } },
        }),
      ),
    onSuccess: invalidate,
  })
}

/** `order[i]` = la photo qui occupera la position i. Permutation exacte de 0…n-1 (D-062). */
export function useReorderProductImages() {
  const invalidate = useInvalidateProducts()
  return useMutation({
    mutationFn: async (variables: { id: number; order: number[] }) =>
      unwrap(
        await apiClient.PATCH("/admin/shop/products/{id}/images/order", {
          params: { path: { id: variables.id } },
          body: { order: variables.order },
        }),
      ),
    onSuccess: invalidate,
  })
}
