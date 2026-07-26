import { apiBaseUrl } from "@/api/client"
import { tokenStore } from "@/api/token-store"

/**
 * Dépôt de l'image de la pièce d'identité (D-050) — HORS du client généré.
 *
 * ═══ POURQUOI PAS `apiClient` ═══
 * `openapi-fetch` sérialise le corps en JSON. Cette route attend un `multipart/form-data`
 * portant un BINAIRE, que le typage généré décrit comme une simple chaîne — le passer par le
 * client demanderait un sérialiseur sur mesure pour un seul appel, sans rien gagner en
 * sécurité de types.
 *
 * On reprend donc à la main la seule chose que le transport fait ici : poser le Bearer. Ce
 * fichier est le SEUL endroit du portail dans ce cas, et il est isolé pour cette raison —
 * dispersé dans un composant d'écran, il finirait recopié.
 *
 * ═══ CONSÉQUENCE ASSUMÉE ═══
 * Cet appel ne bénéficie NI du rejeu après rafraîchissement (401), NI de l'ouverture
 * automatique de la seconde authentification. Aucun des deux ne s'applique : le parcours
 * d'accueil se déroule juste après une connexion (le jeton est frais) et n'est pas une
 * opération d'argent. Si cette route devait un jour en devenir une, il faudrait la faire
 * repasser par le transport.
 */
export async function uploadIdDocument(file: File): Promise<void> {
  const data = new FormData()
  data.append("idDocument", file)

  const response = await fetch(`${apiBaseUrl}/members/me/onboarding/id-document`, {
    method: "POST",
    credentials: "include",
    // Pas de `Content-Type` : c'est au navigateur de le poser, avec sa frontière multipart.
    headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` },
    body: data,
  })

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : `Erreur ${response.status}`
    throw new Error(message)
  }
}
