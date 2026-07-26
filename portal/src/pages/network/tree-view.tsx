import { useEffect, useRef } from "react"
import { Plus } from "lucide-react"
import { PointsBv } from "@/components/format/amount"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"
import type { TreeNode } from "@/api/queries/network"
import {
  layoutTree,
  TREE_CANVAS,
  VISIBLE_LEVELS,
  type PlacedCell,
} from "./tree-layout"

/**
 * MON ARBRE BINAIRE — rendu MAISON, traits en SVG, nœuds en HTML.
 *
 * ═══ POURQUOI PAS UNE BIBLIOTHÈQUE DE GRAPHE ═══
 * Elle apporterait son propre thème (donc des couleurs en dur, contre la règle du projet), son
 * propre DOM (souvent des `<g>` inaccessibles au lecteur d'écran) et une centaine de kilo-octets
 * de JavaScript sur un écran consulté au téléphone. Un arbre binaire borné à trois niveaux tient
 * en une grille fixe : la mise en page est un calcul (`tree-layout.ts`), le rendu une liste.
 *
 * ═══ SVG POUR LES TRAITS, HTML POUR LES NŒUDS ═══
 * Deux couches superposées, et ce n'est pas un compromis : les traits sont du dessin pur, le SVG
 * les rend proprement à toute échelle ; les nœuds sont des BOUTONS — ils doivent être
 * atteignables au clavier, annonçables par un lecteur d'écran et stylables par le thème. Un
 * `<text>` SVG ne coche aucune de ces cases. La couche SVG est donc `aria-hidden` : elle ne
 * porte aucune information que les cartes ne portent déjà.
 *
 * ═══ TROIS ÉTATS DE CASE, JAMAIS CONFONDUS ═══
 * Quelqu'un, une place LIBRE, ou une branche TRONQUÉE par la borne d'affichage. Montrer les
 * places libres est ce qui rend cet écran actionnable — c'est là qu'un filleul peut être placé
 * (D-004 : aucun spillover, la place ne se prend pas toute seule). Les confondre avec une
 * branche tronquée inviterait à placer quelqu'un sur une position déjà occupée.
 *
 * ═══ RECENTRAGE, PAS DÉPLIAGE ═══
 * Cliquer un nœud le fait devenir la nouvelle racine, avec une nouvelle requête bornée. Un
 * sous-arbre peut compter des milliers de membres : le déplier cumulativement finirait par
 * charger tout le réseau pour en montrer trois.
 *
 * ═══ DÉFILEMENT PLUTÔT QUE ZOOM ═══
 * À 390 px, quatre feuilles côte à côte ne tiennent pas. Le dessin garde donc sa largeur et le
 * conteneur défile horizontalement. Un zoom aurait rendu le texte illisible avant de rendre
 * l'arbre lisible — et un affilié qui pince pour lire un nom ne lit plus rien.
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
  const { cells, connectors } = layoutTree(root)
  const scroller = useRef<HTMLDivElement>(null)

  /**
   * Centrer le regard sur la RACINE à l'ouverture, et à chaque recentrage.
   *
   * Le dessin est plus large que l'écran d'un téléphone : sans cela, on arrive sur le bord
   * GAUCHE de l'arbre, c'est-à-dire sur une branche quelconque, avec la racine à moitié coupée
   * hors champ. On croit alors que l'affichage est cassé. La racine est le point de repère —
   * c'est elle qu'on doit voir en premier, les branches se découvrent en faisant défiler.
   *
   * `root.id` en dépendance : après un recentrage, la nouvelle racine doit revenir au centre.
   */
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2
  }, [root.id])

  return (
    <div className="space-y-3">
      <div ref={scroller} className="overflow-x-auto pb-2">
        <div
          className="relative mx-auto"
          style={{ width: TREE_CANVAS.width, height: TREE_CANVAS.height }}
        >
          {/* Couche de dessin. `aria-hidden` : les traits répètent visuellement une relation
              que les cartes annoncent déjà en texte (« jambe gauche de … »). */}
          <svg
            aria-hidden
            className="absolute inset-0 size-full"
            viewBox={`0 0 ${TREE_CANVAS.width} ${TREE_CANVAS.height}`}
            preserveAspectRatio="none"
          >
            {connectors.map((connector) => (
              <path
                key={connector.key}
                d={connector.d}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                // Un trait vers une place LIBRE est en pointillés : il mène à une possibilité,
                // pas à quelqu'un.
                strokeDasharray={connector.filled ? undefined : "4 5"}
                className={cn(
                  connector.leg === "LEFT" ? "stroke-leg-left" : "stroke-leg-right",
                  !connector.filled && "opacity-45",
                )}
              />
            ))}
          </svg>

          {cells.map((cell) => (
            <Cell
              key={cell.key}
              cell={cell}
              isSelf={isSelf && cell.level === 0}
              onFocus={onFocus}
            />
          ))}
        </div>
      </div>

      <Legend />

      <p className="text-xs text-muted-foreground">
        {t("tree.levelsNotice").replace("{levels}", String(VISIBLE_LEVELS))}
      </p>
    </div>
  )
}

function Cell({
  cell,
  isSelf,
  onFocus,
}: {
  cell: PlacedCell
  isSelf: boolean
  onFocus?: (node: TreeNode) => void
}) {
  const t = useT()
  const style = {
    left: cell.x,
    top: cell.y,
    width: TREE_CANVAS.nodeWidth,
    height: TREE_CANVAS.nodeHeight,
  }

  if (cell.kind !== "member") {
    const isEmpty = cell.kind === "empty"
    return (
      <div
        className={cn(
          "absolute flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-2 text-center",
          isEmpty ? "border-border" : "border-border/60 bg-muted/30",
        )}
        style={style}
      >
        {isEmpty ? (
          <>
            <Plus className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-[0.7rem] leading-tight text-muted-foreground">
              {t("tree.freeSlot")}
            </span>
          </>
        ) : (
          // « … » et non « place libre » : quelqu'un EST là, simplement au-delà des niveaux
          // affichés. Recentrer sur son parent le fera apparaître.
          <span className="text-[0.7rem] leading-tight text-muted-foreground">
            {t("tree.more")}
          </span>
        )}
        <span className="sr-only">
          {cell.leg === "LEFT" ? t("legs.left") : t("legs.right")}
        </span>
      </div>
    )
  }

  const node = cell.node
  if (!node) return null
  const initials = `${node.firstName.charAt(0)}${node.lastName.charAt(0)}`

  return (
    <button
      type="button"
      onClick={() => onFocus?.(node)}
      // Le nom accessible dit tout ce que la carte montre, plus la jambe — que le trait de
      // liaison porte visuellement mais qu'un lecteur d'écran ne voit pas.
      aria-label={[
        `${node.firstName} ${node.lastName}`,
        node.memberCode,
        cell.leg === "LEFT" ? t("legs.left") : cell.leg === "RIGHT" ? t("legs.right") : "",
        t(`status.${node.status}` as never),
        t("tree.focusHint"),
      ]
        .filter(Boolean)
        .join(", ")}
      className={cn(
        "absolute flex flex-col items-center justify-center gap-1 rounded-xl border bg-card p-2 text-center transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelf && "border-primary ring-2 ring-primary/25",
      )}
      style={style}
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold",
            statusTone(node.status),
          )}
        >
          {initials}
        </span>
        <span className="max-w-[88px] truncate text-xs font-medium">
          {node.firstName} {node.lastName.charAt(0)}.
        </span>
      </span>

      <span className="font-mono text-[0.65rem] text-muted-foreground">
        {node.memberCode}
      </span>

      {/* Les DEUX jambes du nœud, aux couleurs de jambe du thème — les mêmes que sur
          l'accueil et dans la liste des downlines. En POINTS, jamais en dinars (D-028). */}
      <span className="flex items-center gap-2 text-[0.65rem] tabular-nums">
        <span className="flex items-center gap-1">
          <span aria-hidden className="size-1.5 rounded-full bg-leg-left" />
          <PointsBv value={node.leftPoints} className="text-[0.65rem]" />
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="size-1.5 rounded-full bg-leg-right" />
          <PointsBv value={node.rightPoints} className="text-[0.65rem]" />
        </span>
      </span>

      {isSelf && (
        <span className="absolute -top-2 rounded-full bg-primary px-2 py-0.5 text-[0.6rem] font-semibold text-primary-foreground">
          {t("tree.you")}
        </span>
      )}
    </button>
  )
}

/**
 * Teinte de l'état d'un membre.
 *
 * Trois états, trois tons, et JAMAIS de rouge pour un compte gelé : `INACTIVE` n'est pas une
 * faute, c'est un renouvellement en attente (D-034) — et il s'agit ici du réseau de quelqu'un
 * d'autre, sur lequel l'affilié qui regarde ne peut rien. Alarmer serait gratuit.
 */
function statusTone(status: string): string {
  if (status === "ACTIVE") return "bg-success/20 text-foreground"
  if (status === "INACTIVE") return "bg-warning/20 text-foreground"
  return "bg-muted text-muted-foreground"
}

/**
 * LÉGENDE — sans elle, les teintes d'état ne sont que de la décoration.
 *
 * Elle nomme aussi les deux jambes : c'est la seule façon de savoir, sur un arbre, que le vert
 * olive est la gauche et le violet la droite. Ces couleurs sont partagées avec l'accueil et la
 * liste des downlines, et la légende est ce qui rend ce partage lisible.
 */
function Legend() {
  const t = useT()

  const items = [
    { tone: "bg-success/20", label: t("status.ACTIVE") },
    { tone: "bg-warning/20", label: t("status.INACTIVE") },
    { tone: "bg-muted", label: t("status.REGISTERED") },
  ]

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3 rounded-full", item.tone)} />
          {item.label}
        </span>
      ))}

      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-full bg-leg-left" />
        {t("legs.left")}
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-full bg-leg-right" />
        {t("legs.right")}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-3 rounded-full border-2 border-dashed border-border"
        />
        {t("tree.freeSlot")}
      </span>
    </div>
  )
}
