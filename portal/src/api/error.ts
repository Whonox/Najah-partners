/**
 * Normalisation des erreurs d'API. openapi-fetch renvoie `{ data, error, response }` plutôt
 * que de lever : `unwrap` transforme ça en promesse qui résout ou lève, seule forme que
 * TanStack Query sait interpréter (et qui alimente nos états d'erreur réutilisables).
 */

export class ApiError extends Error {
  // Champ déclaré puis affecté, et non une « propriété de paramètre » : le projet compile en
  // `erasableSyntaxOnly` (le TypeScript doit s'effacer sans transformation).
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }

  /** 401/403 : l'écran n'est pas « en panne », l'accès est refusé — on ne réessaie jamais. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403
  }
}

/** Corps d'erreur standard de NestJS : `{ statusCode, message, error }`. */
interface NestErrorBody {
  message?: string | string[]
  error?: string
}

function readMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback
  const { message, error } = body as NestErrorBody
  if (Array.isArray(message)) return message.join(" · ")
  return message ?? error ?? fallback
}

export async function unwrap<T>(result: {
  data?: T
  error?: unknown
  response: Response
}): Promise<T> {
  if (result.error !== undefined || !result.response.ok) {
    throw new ApiError(
      result.response.status,
      readMessage(result.error, `Erreur ${result.response.status}`),
    )
  }
  return result.data as T
}

/** Message affichable d'une erreur, quelle qu'en soit la provenance. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return "Erreur inattendue"
}
