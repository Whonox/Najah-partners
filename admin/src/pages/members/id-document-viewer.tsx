import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Eye, EyeOff, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiBaseUrl } from "@/api/client"
import { ApiError } from "@/api/error"
import { tokenStore } from "@/api/token-store"
import { refreshAccessToken } from "@/api/client"
import { MEMBERS_KEYS } from "@/api/queries/keys"
import { DataState } from "@/components/common/data-state"
import { useT } from "@/i18n/use-t"

/**
 * Image de la pièce d'identité (D-018, D-039) — l'admin la compare au numéro saisi à la main.
 *
 * POURQUOI CE DÉTOUR plutôt qu'un simple `<img src="/admin/members/1/id-document">` : la route
 * exige un en-tête `Authorization`, qu'un navigateur n'envoie jamais sur le chargement d'une
 * image. On récupère donc le binaire nous-mêmes et on en fait une URL d'objet locale. Le
 * client généré (`openapi-fetch`) ne convient pas non plus ici : il parse la réponse en JSON.
 *
 * MASQUÉE PAR DÉFAUT, et c'est délibéré : une pièce d'identité affichée d'office resterait à
 * l'écran d'un poste partagé dès qu'on ouvre une fiche. L'admin la demande explicitement.
 */
export function IdDocumentViewer({
  memberId,
  hasDocument,
}: {
  memberId: number
  hasDocument: boolean
}) {
  const t = useT()
  const [shown, setShown] = useState(false)

  if (!hasDocument) {
    return (
      <p className="text-sm text-muted-foreground">{t("member.idDocument.none")}</p>
    )
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={() => setShown(!shown)}>
        {shown ? <EyeOff /> : <Eye />}
        {t(shown ? "member.idDocument.hide" : "member.idDocument.show")}
      </Button>
      {shown ? <DocumentImage memberId={memberId} /> : null}
    </div>
  )
}

function DocumentImage({ memberId }: { memberId: number }) {
  const t = useT()

  const query = useQuery({
    queryKey: [...MEMBERS_KEYS.detail(memberId), "id-document"] as const,
    queryFn: () => fetchIdDocument(memberId),
    // Une pièce d'identité ne se garde pas en mémoire plus longtemps que l'écran qui
    // l'affiche (le backend renvoie déjà `Cache-Control: no-store`).
    gcTime: 0,
    staleTime: 0,
    retry: false,
  })

  // L'URL d'objet occupe de la mémoire tant qu'elle n'est pas révoquée : on la libère au
  // démontage (et à chaque changement de membre).
  useEffect(() => {
    const url = query.data?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [query.data?.url])

  return (
    <DataState
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      rows={3}
    >
      {query.data ? (
        query.data.isPdf ? (
          <Button variant="outline" size="sm" render={<a href={query.data.url} target="_blank" rel="noreferrer" />}>
            <FileText />
            {t("member.idDocument.pdf")}
          </Button>
        ) : (
          <img
            src={query.data.url}
            alt={t("member.idDocument.alt")}
            className="max-h-96 w-full rounded-md border object-contain"
          />
        )
      ) : null}
    </DataState>
  )
}

/**
 * Chargement du binaire, avec la MÊME politique de session que le reste de l'application :
 * un 401 déclenche UN rafraîchissement puis un seul rejeu (`refreshAccessToken` partage sa
 * promesse — sans ce partage, la rotation des refresh tokens détecterait une réutilisation
 * et révoquerait la famille, D-016b).
 */
async function fetchIdDocument(
  memberId: number,
): Promise<{ url: string; isPdf: boolean }> {
  const path = `${apiBaseUrl}/admin/members/${memberId}/id-document`

  const send = (token: string | null) =>
    fetch(path, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })

  let response = await send(tokenStore.get())
  if (response.status === 401) {
    const token = await refreshAccessToken()
    if (token) response = await send(token)
  }

  if (!response.ok) {
    throw new ApiError(response.status, "Pièce illisible ou introuvable.")
  }

  const blob = await response.blob()
  return {
    url: URL.createObjectURL(blob),
    isPdf: blob.type === "application/pdf",
  }
}
