import { createContext } from "react"
import type { components } from "@/api/generated/schema"

/** Profil affilié — TYPE GÉNÉRÉ depuis l'OpenAPI, jamais recopié à la main (CLAUDE.md). */
export type MemberProfile = components["schemas"]["MemberProfileDto"]

export type AuthStatus =
  /** Rafraîchissement silencieux en cours : on ne sait pas encore si une session existe. */
  | "restoring"
  | "authenticated"
  | "anonymous"

export interface AuthContextValue {
  status: AuthStatus
  member: MemberProfile | null
  /**
   * Connexion par e-mail, téléphone OU code membre (D-016) — un seul champ, le backend
   * résout lequel des trois. Demander à l'affilié de choisir son type d'identifiant serait
   * lui faire porter une distinction qui ne le concerne pas.
   */
  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /** Recharge le profil après une modification (nom, renouvellement payé…). */
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
