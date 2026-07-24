import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router"
import { CornerLeftUp, RotateCcw, Search } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { membersQueryOptions } from "@/api/queries/members"
import { treeQueryOptions, type TreeNode } from "@/api/queries/genealogy"
import { DataState } from "@/components/common/data-state"
import { PageHeader } from "@/components/common/page-header"
import { errorMessage } from "@/api/error"
import { useT } from "@/i18n/use-t"
import { TreeView } from "./tree-view"

/**
 * Généalogie du réseau (spec §7.2.3).
 *
 * L'ARBRE ENTIER N'EST JAMAIS CHARGÉ, et l'écran est construit pour que ce soit impossible :
 * chaque requête ramène la racine courante et DEUX niveaux (7 nœuds au plus). Descendre =
 * recentrer sur un nœud, c'est-à-dire une nouvelle requête bornée — pas un dépliage qui
 * accumulerait les niveaux en mémoire.
 *
 * Le fil d'Ariane conserve le chemin parcouru : c'est lui qui permet de remonter, puisque le
 * sous-arbre ramené ne contient jamais les ancêtres de sa racine.
 */
export function GenealogyPage() {
  const t = useT()
  const [searchParams] = useSearchParams()

  /**
   * Racine courante + chemin parcouru. La navigation interne (descendre, remonter) vit dans
   * cet état plutôt que dans l'URL : réécrire l'adresse à chaque descente noierait
   * l'historique du navigateur sous des dizaines d'entrées, et le bouton « précédent »
   * deviendrait inutilisable.
   */
  const [rootId, setRootId] = useState<number | null>(null)
  const [trail, setTrail] = useState<TreeNode[]>([])
  const [code, setCode] = useState("")
  const [notFound, setNotFound] = useState(false)

  /**
   * `?member=` est la porte d'entrée depuis la fiche membre. On la lit PENDANT LE RENDU et
   * non dans un effet : c'est le patron « ajuster l'état quand une entrée change » — un
   * effet provoquerait un rendu intermédiaire avec l'ancienne racine, donc un arbre
   * brièvement faux à l'écran, puis un second rendu.
   */
  const memberParam = Number(searchParams.get("member"))
  const [seenParam, setSeenParam] = useState(memberParam)
  if (memberParam !== seenParam) {
    setSeenParam(memberParam)
    if (Number.isInteger(memberParam) && memberParam > 0) {
      setRootId(memberParam)
      setTrail([])
    }
  }

  const tree = useQuery({
    ...treeQueryOptions(rootId ?? 0),
    enabled: rootId !== null,
  })

  /** Recherche par code : le backend n'expose pas de lookup par code, on passe par la liste. */
  const lookup = useQuery({
    ...membersQueryOptions({ search: code.trim(), pageSize: 5, page: 1 }),
    enabled: false,
  })

  async function recenterByCode() {
    const term = code.trim()
    if (!term) return
    setNotFound(false)
    const result = await lookup.refetch()
    // Correspondance EXACTE sur le code : une recherche sur « NP0001 » ne doit pas recentrer
    // silencieusement sur le premier membre dont le code commence ainsi.
    const match = result.data?.items.find(
      (item) => item.memberCode.toLowerCase() === term.toLowerCase(),
    )
    if (!match) {
      setNotFound(true)
      return
    }
    setRootId(match.id)
    setTrail([])
  }

  /** Descendre : la racine courante rejoint le fil d'Ariane, le nœud cliqué devient racine. */
  function descend(node: TreeNode) {
    if (tree.data) {
      setTrail([...trail, tree.data])
    }
    setRootId(node.id)
  }

  /** Remonter d'un cran : on reprend la dernière racine du fil. */
  function goUp() {
    const previous = trail.at(-1)
    if (!previous) return
    setTrail(trail.slice(0, -1))
    setRootId(previous.id)
  }

  function jumpTo(index: number) {
    const target = trail[index]
    setTrail(trail.slice(0, index))
    setRootId(target.id)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("genealogy.title")}
        description={t("genealogy.description")}
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="grid min-w-56 flex-1 gap-1.5">
          <label
            htmlFor="genealogy-code"
            className="text-xs font-medium text-muted-foreground"
          >
            {t("genealogy.search")}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="genealogy-code"
              value={code}
              placeholder={t("genealogy.searchPlaceholder")}
              className="ps-8 font-mono"
              onChange={(event) => {
                setCode(event.target.value)
                setNotFound(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void recenterByCode()
              }}
            />
          </div>
        </div>
        <Button onClick={() => void recenterByCode()} disabled={lookup.isFetching}>
          {t("genealogy.searchSubmit")}
        </Button>
        {trail.length > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setRootId(trail[0].id)
              setTrail([])
            }}
          >
            <RotateCcw />
            {t("genealogy.reset")}
          </Button>
        ) : null}
      </div>

      {notFound ? (
        <Alert variant="destructive">
          <AlertDescription>{t("genealogy.notFound")}</AlertDescription>
        </Alert>
      ) : null}
      {lookup.error ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(lookup.error)}</AlertDescription>
        </Alert>
      ) : null}

      {trail.length > 0 ? (
        <nav
          aria-label={t("genealogy.path")}
          className="flex flex-wrap items-center gap-1 text-sm"
        >
          <Button variant="outline" size="sm" onClick={goUp}>
            <CornerLeftUp />
            {t("genealogy.up")}
          </Button>
          <span className="mx-1 text-muted-foreground">·</span>
          {trail.map((node, index) => (
            <span key={node.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => jumpTo(index)}
                className="rounded px-1 font-mono text-xs text-primary underline-offset-4 hover:underline"
              >
                {node.memberCode}
              </button>
              <span className="text-muted-foreground">›</span>
            </span>
          ))}
        </nav>
      ) : null}

      {rootId === null ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("genealogy.rootPrompt")}
        </div>
      ) : (
        <DataState
          isLoading={tree.isPending}
          error={tree.error}
          onRetry={() => void tree.refetch()}
          rows={4}
        >
          {tree.data ? <TreeView root={tree.data} onDescend={descend} /> : null}
        </DataState>
      )}
    </div>
  )
}
