import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme-context"

const DARK_QUERY = "(prefers-color-scheme: dark)"

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system"
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

/**
 * Thème clair / sombre / système, persisté. Le mode réel est posé en classe `.dark` sur
 * <html> — c'est ce que `@custom-variant dark` attend dans src/index.css.
 *
 * `system` reste VIVANT : si l'utilisateur bascule son OS en sombre pendant qu'il travaille,
 * l'interface suit sans rechargement (abonnement à la media query).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [systemResolved, setSystemResolved] = useState<ResolvedTheme>(systemTheme)

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystemResolved(media.matches ? "dark" : "light")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const resolved: ResolvedTheme = preference === "system" ? systemResolved : preference

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark")
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  const setPreference = useCallback((next: ThemePreference) => {
    localStorage.setItem(THEME_STORAGE_KEY, next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
