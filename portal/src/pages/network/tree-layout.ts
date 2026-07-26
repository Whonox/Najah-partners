import type { TreeNode } from "@/api/queries/network"

/**
 * Mise en page de l'arbre binaire : des COORDONNÉES, sans une ligne de rendu.
 *
 * ═══ POURQUOI UN MODULE À PART ═══
 * Placer les nœuds, deviner les places libres et distinguer une feuille réelle d'une feuille
 * TRONQUÉE sont trois raisonnements ; les mêler au JSX rendrait chacun intestable. Ici, tout
 * est une fonction pure : on lui donne un arbre, elle rend des positions.
 *
 * ═══ TROIS NIVEAUX, ET PAS PLUS ═══
 * Le backend en ramène quatre par défaut (1 + 2 + 4 + 8 = 15 nœuds). Quinze cartes ne se
 * lisent pas — surtout à 390 px, où huit feuilles côte à côte donneraient 45 px chacune. On
 * en affiche donc TROIS (7 nœuds), et l'on descend par RECENTRAGE : c'est exactement le rôle
 * de ce mécanisme, et il coûte une requête bornée plutôt qu'un mur de cartes illisible.
 */

/** Niveaux affichés à la fois, racine comprise. */
export const VISIBLE_LEVELS = 3

/** Largeur d'une colonne de feuille, en unités de dessin. */
const SLOT_WIDTH = 168
const NODE_WIDTH = 152
const NODE_HEIGHT = 84
const ROW_GAP = 56

/** Nombre de colonnes du dernier niveau : 2^(niveaux − 1). */
const COLUMNS = 2 ** (VISIBLE_LEVELS - 1)

export const TREE_CANVAS = {
  width: COLUMNS * SLOT_WIDTH,
  height: VISIBLE_LEVELS * NODE_HEIGHT + (VISIBLE_LEVELS - 1) * ROW_GAP,
  nodeWidth: NODE_WIDTH,
  nodeHeight: NODE_HEIGHT,
}

/**
 * Ce qu'une case de l'arbre peut être.
 *
 *  - `member` : quelqu'un est là ;
 *  - `empty`  : la position est LIBRE — c'est une information, pas un trou. C'est là qu'un
 *    filleul peut être placé, et le montrer est ce qui rend l'arbre actionnable (D-004 :
 *    aucun spillover, la place ne se prend pas toute seule) ;
 *  - `truncated` : quelqu'un est là, mais au-delà des niveaux affichés. Ne PAS le distinguer
 *    d'une place libre serait un contresens grave — on inviterait à placer un filleul sur une
 *    position occupée. C'est `hasLeftChild` / `hasRightChild` qui font cette distinction, et
 *    c'est précisément pour cela qu'ils existent au contrat.
 */
export type CellKind = "member" | "empty" | "truncated"

export interface PlacedCell {
  key: string
  kind: CellKind
  node: TreeNode | null
  /** Jambe occupée sous le parent. `null` pour la racine affichée. */
  leg: "LEFT" | "RIGHT" | null
  /** Coin supérieur gauche, en unités de dessin. */
  x: number
  y: number
  level: number
}

export interface Connector {
  key: string
  /** Chemin SVG orthogonal du parent vers l'enfant. */
  d: string
  leg: "LEFT" | "RIGHT"
  /** Le trait mène-t-il à quelqu'un ? Un trait vers une place libre se dessine en pointillés. */
  filled: boolean
}

export interface TreeLayout {
  cells: PlacedCell[]
  connectors: Connector[]
}

/**
 * Place la racine et ses descendants sur une grille fixe.
 *
 * Chaque niveau `L` occupe `2^L` cases réparties sur les colonnes du dernier niveau : un nœud
 * est donc TOUJOURS centré au-dessus de ses deux enfants, sans calcul de largeur de sous-arbre.
 * C'est ce qui rend la mise en page stable — un arbre déséquilibré ne fait pas glisser les
 * autres branches d'un rendu à l'autre.
 */
export function layoutTree(root: TreeNode): TreeLayout {
  const cells: PlacedCell[] = []
  const connectors: Connector[] = []

  function centerX(level: number, index: number): number {
    // Nombre de colonnes couvertes par une case de ce niveau.
    const span = COLUMNS / 2 ** level
    return (index * span + span / 2) * SLOT_WIDTH
  }

  function rowY(level: number): number {
    return level * (NODE_HEIGHT + ROW_GAP)
  }

  function walk(
    node: TreeNode | null,
    level: number,
    index: number,
    leg: "LEFT" | "RIGHT" | null,
    parentHasChild: boolean,
    key: string,
  ): void {
    if (level >= VISIBLE_LEVELS) return

    const x = centerX(level, index) - NODE_WIDTH / 2
    const y = rowY(level)

    if (!node) {
      // Personne ici. Deux cas TRÈS différents, et les confondre inviterait à placer un
      // filleul sur une position déjà prise (voir `CellKind`).
      cells.push({
        key,
        kind: parentHasChild ? "truncated" : "empty",
        node: null,
        leg,
        x,
        y,
        level,
      })
      return
    }

    cells.push({ key, kind: "member", node, leg, x, y, level })

    if (level + 1 >= VISIBLE_LEVELS) return

    for (const side of ["LEFT", "RIGHT"] as const) {
      const child = side === "LEFT" ? node.left : node.right
      const hasChild = side === "LEFT" ? node.hasLeftChild : node.hasRightChild
      const childIndex = index * 2 + (side === "LEFT" ? 0 : 1)
      const childKey = `${key}-${side}`

      connectors.push({
        key: childKey,
        d: orthogonalPath(
          centerX(level, index),
          y + NODE_HEIGHT,
          centerX(level + 1, childIndex),
          rowY(level + 1),
        ),
        leg: side,
        filled: Boolean(child),
      })

      walk(child ?? null, level + 1, childIndex, side, hasChild, childKey)
    }
  }

  walk(root, 0, 0, null, false, "root")
  return { cells, connectors }
}

/**
 * Trait de liaison en équerre : descente, traversée, descente.
 *
 * Une diagonale serait plus courte, mais dans un arbre binaire elle rend deux branches
 * voisines difficiles à suivre du regard dès qu'elles se croisent visuellement. L'équerre est
 * ce que l'œil suit sans effort — c'est la convention de tous les organigrammes, et un affilié
 * n'a pas à apprendre une lecture nouvelle pour comprendre sa position.
 */
function orthogonalPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = y1 + (y2 - y1) / 2
  return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`
}
