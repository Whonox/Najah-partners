import { ChevronDown, Plus, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PointsBv } from "@/components/format/amount"
import { useT } from "@/i18n/use-t"
import type { TreeNode } from "@/api/queries/network"

/**
 * MON ARBRE BINAIRE — rendu MAISON, sans bibliothèque de graphe.
 *
 * Un arbre binaire borné à deux niveaux tient en quelques `div` : une dépendance de rendu de
 * graphe apporterait son propre thème (donc des couleurs en dur), son propre DOM
 * (inaccessible au lecteur d'écran) et 100 ko de JavaScript sur un écran consulté au
 * téléphone. Même choix qu'en généalogie côté back-office (T8b).
 *
 * ═══ RECENTRAGE, PAS DÉPLIAGE ═══
 * On affiche DEUX niveaux à la fois. Descendre ne déplie pas la branche sous la précédente :
 * cela RECENTRE l'affichage sur le nœud choisi, qui devient la nouvelle racine. Un sous-arbre
 * peut compter des milliers de membres — le déplier cumulativement finirait par charger tout
 * le réseau pour en montrer trois, ce qui est précisément ce que la borne interdit.
 *
 * Les deux jambes portent les couleurs de jambe du THÈME (`--leg-left` / `--leg-right`), les
 * mêmes que sur le tableau de bord et dans la liste des downlines : « à gauche » veut dire la
 * même chose partout.
 */
export function TreeView({
  root,
  isSelf,
  onFocus,
}: {
  root: TreeNode
  /**
   * La racine affichée est-elle MOI ? Après un recentrage, la racine est un downline : lui
   * écrire « Vous » ferait croire à l'affilié qu'il regarde sa propre position, et les points
   * affichés seraient lus comme les siens. Deux notions distinctes, donc deux propriétés.
   */
  isSelf: boolean
  /** Recentrer sur un nœud : l'appelant relance une requête bornée depuis ce membre. */
  onFocus?: (node: TreeNode) => void
}) {
  const t = useT()

  return (
    <div className="space-y-4">
      <NodeCard node={root} isRoot isSelf={isSelf} />

      <div className="grid grid-cols-2 gap-3">
        <BranchColumn
          side="left"
          label={t("network.legLeft")}
          child={root.left ?? null}
          exists={root.hasLeftChild}
          onFocus={onFocus}
        />
        <BranchColumn
          side="right"
          label={t("network.legRight")}
          child={root.right ?? null}
          exists={root.hasRightChild}
          onFocus={onFocus}
        />
      </div>
    </div>
  )
}

function BranchColumn({
  side,
  label,
  child,
  exists,
  onFocus,
}: {
  side: "left" | "right"
  label: string
  child: TreeNode | null
  /** Un enfant existe-t-il, MÊME au-delà de la profondeur ramenée ? */
  exists: boolean
  onFocus?: (node: TreeNode) => void
}) {
  const t = useT()

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full",
            side === "left" ? "bg-leg-left" : "bg-leg-right",
          )}
        />
        {label}
      </p>

      {child ? (
        <div className="space-y-2">
          <NodeCard node={child} onFocus={onFocus} />

          {/* Deuxième niveau : compact, et cliquable pour recentrer. */}
          <div className="ms-3 space-y-1.5 border-s ps-3">
            <GrandChild node={child.left ?? null} exists={child.hasLeftChild} onFocus={onFocus} />
            <GrandChild node={child.right ?? null} exists={child.hasRightChild} onFocus={onFocus} />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          {exists ? t("network.boundedNotice") : t("network.emptyLeg")}
        </div>
      )}
    </div>
  )
}

function GrandChild({
  node,
  exists,
  onFocus,
}: {
  node: TreeNode | null
  exists: boolean
  onFocus?: (node: TreeNode) => void
}) {
  const t = useT()

  if (!node) {
    return (
      <p className="rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
        {exists ? "…" : t("network.emptyLeg")}
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onFocus?.(node)}
      disabled={!onFocus}
      className="flex w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-start text-xs hover:bg-accent disabled:cursor-default"
    >
      <span className="min-w-0 flex-1 truncate">
        {node.firstName} {node.lastName}
      </span>
      {(node.hasLeftChild || node.hasRightChild) && onFocus ? (
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  )
}

function NodeCard({
  node,
  isRoot,
  isSelf,
  onFocus,
}: {
  node: TreeNode
  /** Nœud posé en tête de l'affichage (fond doré). */
  isRoot?: boolean
  /** Ce nœud est-il le membre connecté ? Seul lui porte le libellé « Vous ». */
  isSelf?: boolean
  onFocus?: (node: TreeNode) => void
}) {
  const t = useT()

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        isRoot ? "border-highlight-border bg-highlight" : "bg-card",
      )}
    >
      <div className="flex items-start gap-2">
        <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {isSelf ? t("network.me") : `${node.firstName} ${node.lastName}`}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {node.memberCode}
          </p>
        </div>
        {node.packName ? (
          <Badge variant="outline" className="shrink-0">
            {node.packName}
          </Badge>
        ) : null}
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-muted-foreground">{t("network.pointsLeft")}</dt>
          <dd>
            <PointsBv value={node.leftPoints} />
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="text-muted-foreground">{t("network.pointsRight")}</dt>
          <dd>
            <PointsBv value={node.rightPoints} />
          </dd>
        </div>
      </dl>

      {!isRoot && onFocus && (node.hasLeftChild || node.hasRightChild) ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => onFocus(node)}
        >
          <Plus />
          {t("network.focus")}
        </Button>
      ) : null}
    </div>
  )
}
