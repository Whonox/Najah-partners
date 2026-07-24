import { createContext } from "react"

/** Choix de l'utilisateur. `system` suit le réglage du système d'exploitation, en direct. */
export type ThemePreference = "light" | "dark" | "system"

/** Ce qui est réellement affiché une fois `system` résolu. */
export type ResolvedTheme = "light" | "dark"

export interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Clé de persistance du choix (le seul réglage d'interface stocké côté navigateur). */
export const THEME_STORAGE_KEY = "najah-admin-theme"
