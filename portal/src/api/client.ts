import createClient from "openapi-fetch"
import { STEP_UP_REQUIRED } from "./error"
import type { paths } from "./generated/schema"
import { requestStepUp } from "./step-up-gate"
import { stepUpStore } from "./step-up-store"
import { tokenStore } from "./token-store"

/** En-tête portant la preuve de seconde authentification (D-058). */
export const STEP_UP_HEADER = "X-Step-Up"

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"

export const apiBaseUrl = baseUrl

/**
 * Routes qui ne portent JAMAIS de Bearer et ne déclenchent JAMAIS de rafraîchissement :
 * elles SONT le rafraîchissement, ou son absence (connexion, mot de passe oublié). Rejouer
 * un /auth/refresh sur un 401 de /auth/refresh serait une boucle infinie.
 */
const AUTH_ROUTES = [
  "/auth/member/login",
  "/auth/refresh",
  "/auth/logout",
  "/auth/member/password/forgot",
  "/auth/member/password/reset",
]

function isAuthRoute(url: string): boolean {
  const path = new URL(url, baseUrl).pathname
  return AUTH_ROUTES.includes(path)
}

/**
 * UNE SEULE promesse de rafraîchissement en vol.
 *
 * Le tableau de bord part avec plusieurs requêtes simultanées (profil, agrégats, e-cards) :
 * après un quart d'heure d'inactivité, elles échouent TOUTES en 401 en même temps. Sans ce
 * partage, autant de /auth/refresh concurrents seraient émis, et la rotation des refresh
 * tokens — qui détecte la RÉUTILISATION (D-016b) — révoquerait la famille entière. L'affilié
 * serait éjecté vers l'écran de connexion pour avoir simplement laissé son onglet ouvert.
 * Ici, toutes attendent la même promesse et rejouent avec le même nouveau token.
 */
let refreshInFlight: Promise<string | null> | null = null

export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include", // cookie refresh httpOnly (D-016)
      })
      if (!response.ok) {
        tokenStore.clear()
        return null
      }
      const data = (await response.json()) as { accessToken: string }
      tokenStore.set(data.accessToken)
      return data.accessToken
    } catch {
      // Réseau coupé : on ne purge pas le token en mémoire, il peut encore être valide.
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/**
 * Pose le Bearer et, s'il en existe un de valide, le jeton de seconde authentification.
 *
 * Le jeton `X-Step-Up` accompagne TOUTES les requêtes tant qu'il est valable, et pas
 * seulement celles qui l'exigent : la couche transport ne sait pas quelles routes sont
 * gardées — cette liste vit côté serveur, et l'y dupliquer garantirait qu'elle divergera.
 * L'envoyer partout coûte quelques octets d'en-tête et évite un aller-retour de refus sur
 * chaque écran d'argent.
 */
function withCredentials(request: Request, token: string | null): Request {
  const headers = new Headers(request.headers)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const stepUp = stepUpStore.get()
  if (stepUp) headers.set(STEP_UP_HEADER, stepUp)
  return new Request(request, { headers })
}

/**
 * Le corps d'un refus, lu SANS le consommer.
 *
 * Une réponse ne se lit qu'une fois : la lire ici priverait l'appelant de son message
 * d'erreur. On travaille donc sur un clone, et on rend `null` au moindre problème — un corps
 * illisible n'est pas une raison de faire échouer le traitement de l'erreur elle-même.
 */
async function peekErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json()
    if (typeof body !== "object" || body === null) return null
    const { code } = body as { code?: unknown }
    return typeof code === "string" ? code : null
  } catch {
    return null
  }
}

/**
 * `fetch` de transport. Il gère DEUX rejeux, de natures différentes :
 *
 *  1. **401 → rafraîchissement** (D-016). L'access token a expiré ; on le renouvelle
 *     silencieusement et on rejoue. L'affilié ne voit rien, et c'est le but.
 *
 *  2. **403 `STEP_UP_REQUIRED` → seconde authentification** (D-051/D-058). Là, on ne peut
 *     RIEN faire silencieusement : la preuve demandée n'existe que dans la tête du membre. On
 *     ouvre donc la boîte de dialogue (via `requestStepUp`), et on rejoue s'il a répondu.
 *
 * Un rejeu au plus par cause : le second refus est rendu tel quel. Boucler serait pire que
 * d'échouer — un membre bloqué (5 essais, D-058) verrait le dialogue se rouvrir indéfiniment.
 *
 * La requête est clonée AVANT chaque envoi : son corps est un flux, consommé une seule fois ;
 * sans clone, le rejeu partirait sans corps — et un rejeu de checkout sans corps serait un
 * paiement vide.
 */
const authFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init)

  if (isAuthRoute(request.url)) {
    return fetch(request)
  }

  const afterRefresh = request.clone()
  const afterStepUp = request.clone()

  let response = await fetch(withCredentials(request, tokenStore.get()))

  if (response.status === 401) {
    const token = await refreshAccessToken()
    if (!token) {
      tokenStore.clear()
      return response // 401 d'origine : l'appelant voit l'échec, la session est déjà tombée.
    }
    response = await fetch(withCredentials(afterRefresh, token))
  }

  if (response.status === 403) {
    const code = await peekErrorCode(response)
    if (code === STEP_UP_REQUIRED) {
      // Le jeton en mémoire, s'il en restait un, n'a pas convaincu le serveur : il est
      // périmé de son point de vue. On l'oublie AVANT de demander, sinon le rejeu repartirait
      // avec le même jeton refusé.
      stepUpStore.clear()
      const stepUpToken = await requestStepUp()
      if (!stepUpToken) {
        return response // le membre a renoncé : le refus est la bonne réponse.
      }
      response = await fetch(withCredentials(afterStepUp, tokenStore.get()))
    }
  }

  return response
}

export const apiClient = createClient<paths>({
  baseUrl,
  credentials: "include", // cookie refresh token httpOnly (D-016)
  fetch: authFetch,
})
