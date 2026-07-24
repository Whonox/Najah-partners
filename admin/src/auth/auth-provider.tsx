import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiClient, refreshAccessToken } from "@/api/client"
import { unwrap } from "@/api/error"
import { tokenStore } from "@/api/token-store"
import {
  AuthContext,
  type AdminProfile,
  type AdminRole,
  type AuthStatus,
} from "./auth-context"

/** Profil de l'admin connecté. Le token ne porte que l'id et le rôle : le nom vient de la base. */
async function fetchAdminProfile(): Promise<AdminProfile> {
  return unwrap(await apiClient.GET("/auth/admin/me"))
}

/**
 * Session administrateur (D-016).
 *
 * Cycle : au montage, un rafraîchissement SILENCIEUX tente de reconstruire la session à partir
 * du cookie httpOnly — c'est ce qui permet de recharger une page sans se reconnecter, alors que
 * l'access token, lui, n'a jamais quitté la mémoire. Tant que cette tentative n'a pas répondu,
 * le statut est `restoring` : router sur `/login` avant sa réponse déconnecterait un admin à
 * chaque F5.
 *
 * Le provider est ABONNÉ au store de token : quand le transport purge le token (échec de
 * rafraîchissement sur un 401), la session bascule ici en `anonymous`, sans qu'aucun écran
 * n'ait à s'en occuper.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>("restoring")
  const [admin, setAdmin] = useState<AdminProfile | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const token = await refreshAccessToken()
      if (cancelled) return
      if (!token) {
        setStatus("anonymous")
        return
      }
      try {
        const profile = await fetchAdminProfile()
        if (cancelled) return
        setAdmin(profile)
        setStatus("authenticated")
      } catch {
        // Token valide mais pas ADMIN (un jeton MEMBER ne franchit pas le guard, D-016), ou
        // compte désactivé entre-temps : pas de session de back-office.
        if (cancelled) return
        tokenStore.clear()
        setAdmin(null)
        setStatus("anonymous")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () =>
      tokenStore.subscribe((token) => {
        if (token === null) {
          setAdmin(null)
          setStatus((current) => (current === "restoring" ? current : "anonymous"))
        }
      }),
    [],
  )

  const login = useCallback(async (email: string, password: string) => {
    const data = await unwrap(
      await apiClient.POST("/auth/admin/login", { body: { email, password } }),
    )
    tokenStore.set(data.accessToken)
    setAdmin(await fetchAdminProfile())
    setStatus("authenticated")
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiClient.POST("/auth/logout")
    } finally {
      // Quoi qu'ait répondu le serveur, l'état local part : garder un token après une
      // déconnexion demandée serait le pire des deux mondes.
      tokenStore.clear()
      setAdmin(null)
      setStatus("anonymous")
      queryClient.clear() // aucune donnée du compte précédent ne survit à la déconnexion
    }
  }, [queryClient])

  const hasRole = useCallback(
    (roles: readonly AdminRole[]) =>
      roles.length === 0 || (admin !== null && roles.includes(admin.role)),
    [admin],
  )

  const value = useMemo(
    () => ({ status, admin, hasRole, login, logout }),
    [status, admin, hasRole, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
