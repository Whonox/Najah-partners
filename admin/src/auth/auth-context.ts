import { createContext } from "react"
import type { components } from "@/api/generated/schema"

/** Profil admin — TYPE GÉNÉRÉ depuis l'OpenAPI, jamais recopié à la main (CLAUDE.md). */
export type AdminProfile = components["schemas"]["AdminProfileResponseDto"]

/** Rôles RBAC (D-017b), tels que le backend les déclare. */
export type AdminRole = AdminProfile["role"]

export type AuthStatus =
  /** Rafraîchissement silencieux en cours : on ne sait pas encore si une session existe. */
  | "restoring"
  | "authenticated"
  | "anonymous"

export interface AuthContextValue {
  status: AuthStatus
  admin: AdminProfile | null
  /** Vrai si le rôle courant fait partie des rôles autorisés (liste vide = aucune restriction). */
  hasRole: (roles: readonly AdminRole[]) => boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
