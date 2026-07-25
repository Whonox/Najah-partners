import { Link } from "react-router"
import { ChevronDown, ExternalLink } from "lucide-react"
import type { TreeNode } from "@/api/queries/genealogy"
import { MemberStatusBadge } from "@/components/common/status-badge"
import { PointsBv } from "@/components/format/amount"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/use-t"

/**
 * Rendu de l'arbre binaire — À LA MAIN, sans bibliothèque de graphe, et c'est un choix :
 *
 *  - un arbre BINAIRE BORNÉ (racine + 2 niveaux = 7 nœuds au plus) se dispose en quelques
 *    règles CSS ; `react-flow` ou `d3-hierarchy` apporteraient un modèle canvas / pan / zoom
 *    / glisser-déposer dont rien ici n'a besoin, plus leur propre habillage — qui violerait
 *    la règle « aucune couleur en dur » du projet ;
 *  - le DOM reste NAVIGABLE : tabulation, lecteur d'écran, recherche du navigateur. Un canvas
 *    perd tout cela, sur un outil qu'on utilise des heures ;
 *  - la performance ne dépend pas du réseau mais de la BORNE : sept nœuds se dessinent
 *    instantanément, que le réseau en compte cent ou cent mille.
 *
 * La descente ne DÉPLIE pas : elle RECENTRE (nouvelle requête bornée). Un dépliage cumulatif
 * finirait par tenir l'arbre entier en mémoire — exactement ce que la borne interdit.
 */
export function TreeView({
  root,
  onDescend,
}: {
  root: TreeNode
  onDescend: (node: TreeNode) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card p-4">
      <div className="flex min-w-max flex-col items-center gap-4">
        <NodeCard node={root} onDescend={onDescend} isRoot />
        {root.hasLeftChild || root.hasRightChild ? (
          <Branch node={root} onDescend={onDescend} />
        ) : null}
      </div>
    </div>
  )
}

/**
 * Un niveau : le trait de liaison, puis les deux jambes CÔTE À CÔTE — toujours les deux,
 * gauche puis droite, même quand l'une est libre. Masquer une position vacante ferait glisser
 * l'autre au centre, et un downline droit se lirait comme un gauche.
 */
function Branch({
  node,
  onDescend,
}: {
  node: TreeNode
  onDescend: (node: TreeNode) => void
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="h-4 w-px bg-border" aria-hidden />
      <div className="flex items-start gap-6 border-t pt-4 sm:gap-10">
        <Leg
          side="LEFT"
          child={node.left}
          exists={node.hasLeftChild}
          onDescend={onDescend}
        />
        <Leg
          side="RIGHT"
          child={node.right}
          exists={node.hasRightChild}
          onDescend={onDescend}
        />
      </div>
    </div>
  )
}

function Leg({
  side,
  child,
  exists,
  onDescend,
}: {
  side: "LEFT" | "RIGHT"
  child: TreeNode | null | undefined
  /** Un downline existe-t-il de ce côté — même au-delà de la profondeur ramenée ? */
  exists: boolean
  onDescend: (node: TreeNode) => void
}) {
  const t = useT()

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t(side === "LEFT" ? "genealogy.legLeft" : "genealogy.legRight")}
      </span>
      {child ? (
        <>
          <NodeCard node={child} onDescend={onDescend} />
          {child.left || child.right ? (
            <Branch node={child} onDescend={onDescend} />
          ) : null}
        </>
      ) : exists ? (
        // Cas impossible en pratique (un enfant déclaré est toujours ramené au premier
        // niveau), mais on ne prétend pas que la position est libre si elle ne l'est pas.
        <span className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {t("genealogy.moreBelow")}
        </span>
      ) : (
        <span className="rounded-md border border-dashed px-3 py-6 text-xs text-muted-foreground italic">
          {t("genealogy.free")}
        </span>
      )}
    </div>
  )
}

/**
 * Une case de l'arbre. Elle ne porte QUE des points (D-028) — jamais un dinar : le solde d'un
 * membre n'a rien à faire dans une vue de réseau, et la CTE ne le descend d'ailleurs pas.
 */
function NodeCard({
  node,
  onDescend,
  isRoot = false,
}: {
  node: TreeNode
  onDescend: (node: TreeNode) => void
  isRoot?: boolean
}) {
  const t = useT()
  /**
   * Toute carte AUTRE que la racine recentre — y compris une feuille : l'écran annonce
   * « cliquez un membre pour recentrer l'arbre sur lui », il doit le faire pour tous. Le
   * recentrage sur la racine courante n'aurait, lui, aucun effet.
   */
  const canRecenter = !isRoot

  return (
    <div
      className={cn(
        // `relative` porte le bouton en surimpression ci-dessous.
        "relative w-52 rounded-lg border bg-background p-3 text-sm shadow-xs transition-colors",
        isRoot && "border-primary",
        canRecenter &&
          "cursor-pointer hover:border-primary hover:bg-accent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
      )}
    >
      {/*
        La carte entière est cliquable par un VRAI <button> étalé dessus, plutôt qu'un
        `role="button"` posé sur la carte : une carte contient déjà un lien (« ouvrir la
        fiche »), et l'ARIA interdit à un bouton d'englober un élément interactif. Le bouton
        en surimpression garde une sémantique valide, le focus clavier natif et l'ordre de
        tabulation — le lien, remonté par `z-10`, reste cliquable par-dessus.
      */}
      {canRecenter ? (
        <button
          type="button"
          className="absolute inset-0 z-0 rounded-lg outline-none"
          aria-label={t("genealogy.recenterOn", { code: node.memberCode })}
          onClick={() => onDescend(node)}
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        {/* SEUL élément remonté au-dessus du bouton : le lien vers la fiche. Tout le reste de
            la carte est transparent au clic et déclenche donc le recentrage. */}
        <Link
          to={`/members/${node.id}`}
          title={t("genealogy.openMember")}
          className="relative z-10 font-mono text-xs text-primary underline-offset-4 hover:underline"
        >
          {node.memberCode}
          <ExternalLink className="ms-1 inline size-3" />
        </Link>
        <MemberStatusBadge status={node.status} />
      </div>

      <p className="mt-1 truncate font-medium" title={`${node.lastName} ${node.firstName}`}>
        {node.lastName} {node.firstName}
      </p>
      <p className="text-xs text-muted-foreground">
        {node.packName ?? t("common.none")}
      </p>

      {/* Les DEUX jambes du nœud, en POINTS entiers. C'est l'information centrale de l'écran. */}
      <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2 text-xs">
        <div>
          <span className="block text-muted-foreground">
            {t("members.legLeft")}
          </span>
          <PointsBv value={node.leftPoints} />
        </div>
        <div>
          <span className="block text-muted-foreground">
            {t("members.legRight")}
          </span>
          <PointsBv value={node.rightPoints} />
        </div>
      </div>

      {/* Affordance PUREMENT VISUELLE : c'est le bouton en surimpression qui reçoit le clic.
          Un second élément interactif ici doublerait l'arrêt de tabulation sur chaque carte. */}
      {canRecenter ? (
        <p
          aria-hidden
          className="mt-2 flex items-center justify-center gap-1 rounded-md border py-1 text-xs text-muted-foreground"
        >
          <ChevronDown className="size-3" />
          {t("genealogy.recenter")}
        </p>
      ) : null}
    </div>
  )
}
