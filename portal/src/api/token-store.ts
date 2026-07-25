/**
 * Access token (~15 min) — EN MÉMOIRE, jamais en localStorage ni sessionStorage (D-016).
 * Un token dans le stockage du navigateur est lisible par n'importe quel script injecté et
 * survit à la fermeture de l'onglet ; ici, recharger la page le perd, et c'est voulu : la
 * session se restaure par le cookie refresh httpOnly, qu'aucun script ne peut lire.
 *
 * Ce module est délibérément minuscule et sans dépendance React : le client HTTP en a besoin
 * hors de tout composant.
 */

let accessToken: string | null = null

type Listener = (token: string | null) => void
const listeners = new Set<Listener>()

export const tokenStore = {
  get: (): string | null => accessToken,

  set(token: string | null): void {
    accessToken = token
    listeners.forEach((listener) => listener(token))
  },

  clear(): void {
    tokenStore.set(null)
  },

  /** S'abonner aux changements (le provider d'auth s'en sert pour retomber à « anonyme »). */
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
