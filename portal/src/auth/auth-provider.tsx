import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiClient, refreshAccessToken } from "@/api/client"
import { unwrap } from "@/api/error"
import { tokenStore } from "@/api/token-store"
import { AuthContext, type AuthStatus, type MemberProfile } from "./auth-context"

/**
 * Profil de l'affilié connecté. Le token ne porte que l'id : le nom, le statut, le pack et
 * l'échéance de renouvellement viennent de la base, qui peut avoir changé depuis l'émission
 * du jeton (une activation, une validation de renouvellement…).
 */
async function fetchMemberProfile(): Promise<MemberProfile> {
  return unwrap(await apiClient.GET("/members/me"))
}

/**
 * Session affilié (D-016).
 *
 * Cycle : au montage, un rafraîchissement SILENCIEUX tente de reconstruire la session à partir
 * du cookie httpOnly — c'est ce qui permet de recharger une page sans se reconnecter, alors que
 * l'access token, lui, n'a jamais quitté la mémoire. Tant que cette tentative n'a pas répondu,
 * le statut est `restoring` : router sur `/connexion` avant sa réponse déconnecterait l'affilié
 * à chaque rechargement, ce qui, sur un téléphone où l'onglet se recharge tout seul, rendrait
 * le portail inutilisable.
 *
 * Le provider est ABONNÉ au store de token : quand le transport purge le token (échec de
 * rafraîchissement sur un 401), la session bascule ici en `anonymous`, sans qu'aucun écran
 * n'ait à s'en occuper.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>("restoring")
  const [member, setMember] = useState<MemberProfile | null>(null)

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
        const profile = await fetchMemberProfile()
        if (cancelled) return
        setMember(profile)
        setStatus("authenticated")
      } catch {
        // Token valide mais pas MEMBER (un jeton ADMIN ne franchit pas le guard, D-016) :
        // pas de session de portail.
        if (cancelled) return
        tokenStore.clear()
        setMember(null)
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
          setMember(null)
          setStatus((current) => (current === "restoring" ? current : "anonymous"))
        }
      }),
    [],
  )

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await unwrap(
      await apiClient.POST("/auth/member/login", {
        body: { identifier, password },
      }),
    )
    tokenStore.set(data.accessToken)
    setMember(await fetchMemberProfile())
    setStatus("authenticated")
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiClient.POST("/auth/logout")
    } finally {
      // Quoi qu'ait répondu le serveur, l'état local part : garder un token après une
      // déconnexion demandée serait le pire des deux mondes.
      tokenStore.clear()
      setMember(null)
      setStatus("anonymous")
      queryClient.clear() // aucune donnée du compte précédent ne survit à la déconnexion
    }
  }, [queryClient])

  const refreshProfile = useCallback(async () => {
    setMember(await fetchMemberProfile())
  }, [])

  const value = useMemo(
    () => ({ status, member, login, logout, refreshProfile }),
    [status, member, login, logout, refreshProfile],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
