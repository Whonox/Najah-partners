import createClient from "openapi-fetch"
import type { paths } from "./generated/schema"
import { tokenStore } from "./token-store"

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

function withBearer(request: Request, token: string | null): Request {
  if (!token) return request
  const headers = new Headers(request.headers)
  headers.set("Authorization", `Bearer ${token}`)
  return new Request(request, { headers })
}

/**
 * `fetch` de transport : pose le Bearer, et sur un 401 tente UN rafraîchissement puis rejoue
 * la requête UNE fois. Un échec de rafraîchissement purge l'état en mémoire — le provider
 * d'auth, abonné au store, bascule alors l'application vers l'écran de connexion.
 *
 * La requête est clonée AVANT le premier envoi : son corps est un flux, consommé une seule
 * fois ; sans clone, le rejeu partirait sans corps — et un rejeu de checkout sans corps
 * serait un paiement vide.
 */
const authFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init)

  if (isAuthRoute(request.url)) {
    return fetch(request)
  }

  const replay = request.clone()
  const response = await fetch(withBearer(request, tokenStore.get()))
  if (response.status !== 401) {
    return response
  }

  const token = await refreshAccessToken()
  if (!token) {
    tokenStore.clear()
    return response // 401 d'origine : l'appelant voit l'échec, la session est déjà tombée.
  }
  return fetch(withBearer(replay, token))
}

export const apiClient = createClient<paths>({
  baseUrl,
  credentials: "include", // cookie refresh token httpOnly (D-016)
  fetch: authFetch,
})
