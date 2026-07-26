/**
 * Jeton de SECONDE AUTHENTIFICATION (D-051/D-058) — en mémoire, comme l'access token.
 *
 * ═══ CE QUE CE JETON EST, ET N'EST PAS ═══
 * Ce n'est pas une session : c'est la preuve que la personne devant l'écran vient de prouver
 * son identité, il y a moins de dix minutes. Il accompagne les opérations qui touchent à
 * l'argent (en-tête `X-Step-Up`) et rien d'autre.
 *
 * ═══ POURQUOI IL NE VA NULLE PART AILLEURS QU'EN MÉMOIRE ═══
 * Le mettre en `localStorage` le ferait survivre à la fermeture de l'onglet : un poste
 * partagé rouvert le lendemain donnerait encore accès aux écrans d'argent sans redemander le
 * PIN. Toute la valeur de ce jeton tient à sa brièveté — la persister la détruit.
 *
 * ═══ L'EXPIRATION EST VÉRIFIÉE ICI AUSSI ═══
 * Le backend la vérifie de toute façon (c'est lui qui fait autorité). Mais un jeton dont on
 * SAIT qu'il est périmé ne doit pas être envoyé : cela coûterait un aller-retour pour un
 * refus certain, et l'affilié verrait un échec là où on peut lui demander son PIN tout de
 * suite. Une marge d'avance évite le cas limite où le jeton expire pendant le trajet réseau.
 */

/** Marge d'avance : on considère le jeton mort un peu avant sa vraie échéance. */
const EXPIRY_MARGIN_MS = 5_000

interface StepUpToken {
  token: string
  expiresAt: number
}

let current: StepUpToken | null = null

type Listener = (valid: boolean) => void
const listeners = new Set<Listener>()

function notify(): void {
  const valid = stepUpStore.get() !== null
  listeners.forEach((listener) => listener(valid))
}

export const stepUpStore = {
  /** Le jeton s'il est encore valable, `null` sinon (et il est alors oublié). */
  get(): string | null {
    if (!current) return null
    if (Date.now() >= current.expiresAt - EXPIRY_MARGIN_MS) {
      current = null
      return null
    }
    return current.token
  },

  set(token: string, expiresAt: string | number | Date): void {
    current = { token, expiresAt: new Date(expiresAt).getTime() }
    notify()
  },

  clear(): void {
    current = null
    notify()
  },

  /** Millisecondes restantes — pour dire à l'écran quand la vérification retombera. */
  remainingMs(): number {
    if (!current) return 0
    return Math.max(0, current.expiresAt - Date.now())
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
