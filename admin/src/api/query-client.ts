import { QueryClient } from "@tanstack/react-query"
import { ApiError } from "./error"

/**
 * Réglages communs à tous les écrans du back-office.
 *
 * `retry` ne réessaie JAMAIS une erreur d'autorisation : un 401 a déjà donné lieu à une
 * tentative de rafraîchissement dans le transport (voir `client.ts`), et un 403 ne deviendra
 * pas un 200 en insistant — réessayer ne ferait que retarder l'affichage du vrai message.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.isAuthError) return false
          return failureCount < 2
        },
      },
      mutations: { retry: false },
    },
  })
}
