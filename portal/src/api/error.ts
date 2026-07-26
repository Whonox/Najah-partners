/**
 * Normalisation des erreurs d'API. openapi-fetch renvoie `{ data, error, response }` plutôt
 * que de lever : `unwrap` transforme ça en promesse qui résout ou lève, seule forme que
 * TanStack Query sait interpréter (et qui alimente nos états d'erreur réutilisables).
 */

/**
 * Codes de refus que le backend NOMME, parce que l'écran doit réagir différemment selon le
 * cas et qu'un 403 nu ne le lui dit pas (T9.5).
 *
 * Sans eux, « terminez votre première connexion », « confirmez votre identité » et « vous
 * n'avez pas le droit » se ressembleraient tous : le portail afficherait une erreur là où il
 * doit ouvrir un parcours ou une boîte de dialogue.
 */
export const ONBOARDING_REQUIRED = "ONBOARDING_REQUIRED"
export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED"
export const STEP_UP_REFUSED = "STEP_UP_REFUSED"

export class ApiError extends Error {
  // Champ déclaré puis affecté, et non une « propriété de paramètre » : le projet compile en
  // `erasableSyntaxOnly` (le TypeScript doit s'effacer sans transformation).
  readonly status: number
  /** Code nommé par le backend, quand il en pose un. Voir les constantes ci-dessus. */
  readonly code: string | null

  constructor(status: number, message: string, code: string | null = null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }

  /** 401/403 : l'écran n'est pas « en panne », l'accès est refusé — on ne réessaie jamais. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403
  }

  /** Le parcours de première connexion n'est pas terminé (D-050) : il faut y renvoyer. */
  get isOnboardingRequired(): boolean {
    return this.code === ONBOARDING_REQUIRED
  }
}

/** Corps d'erreur standard de NestJS : `{ statusCode, message, error }`, plus notre `code`. */
interface NestErrorBody {
  message?: string | string[]
  error?: string
  code?: string
}

function readCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  return (body as NestErrorBody).code ?? null
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
      readCode(result.error),
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
