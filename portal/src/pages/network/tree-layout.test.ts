import { describe, expect, it } from "vitest"
import { layoutTree, TREE_CANVAS, VISIBLE_LEVELS, type PlacedCell } from "./tree-layout"
import type { TreeNode } from "@/api/queries/network"

/**
 * MISE EN PAGE DE L'ARBRE — la raison d'être de ce module en fonction pure.
 *
 * Le point le plus important tient en une phrase : une case vide peut signifier DEUX choses
 * opposées. Soit la position est libre — et c'est là qu'un filleul se place (D-004 : aucun
 * spillover) —, soit quelqu'un s'y trouve déjà mais au-delà des niveaux affichés. Les
 * confondre inviterait à placer un filleul sur une position occupée, et le refus n'arriverait
 * qu'au bout du formulaire d'inscription.
 *
 * Rien de tout cela ne se voit sur une capture d'écran : deux cases en pointillés se
 * ressemblent. C'est exactement ce qu'un test doit tenir.
 */

function node(over: Partial<TreeNode> & { id: number }): TreeNode {
  return {
    memberCode: `NP${String(over.id).padStart(6, "0")}`,
    firstName: "Prénom",
    lastName: "Nom",
    status: "ACTIVE",
    leftPoints: 0,
    rightPoints: 0,
    hasLeftChild: false,
    hasRightChild: false,
    left: null,
    right: null,
    ...over,
  } as TreeNode
}

/**
 * Un arbre PLEIN sur les deux premiers niveaux : la racine, ses deux enfants, et de quoi
 * peupler le troisième. Plusieurs tests de géométrie en ont besoin — une grille ne se vérifie
 * pas sur un arbre vide, où la moitié des cases n'existe pas (voir « on ne descend pas sous
 * une place libre »).
 */
function fullTree(): TreeNode {
  return node({
    id: 1,
    hasLeftChild: true,
    hasRightChild: true,
    left: node({ id: 2, hasLeftChild: true, hasRightChild: true, left: node({ id: 4 }), right: node({ id: 5 }) }),
    right: node({ id: 3, hasLeftChild: true, hasRightChild: true, left: node({ id: 6 }), right: node({ id: 7 }) }),
  })
}

/** Retrouve une case par sa clé de chemin (« root-LEFT-RIGHT »). */
function cell(cells: PlacedCell[], key: string): PlacedCell {
  const found = cells.find((c) => c.key === key)
  if (!found) throw new Error(`case introuvable : ${key}`)
  return found
}

describe("layoutTree — place libre ou branche tronquée", () => {
  it("une feuille SANS enfant déclaré rend une place LIBRE", () => {
    const root = node({ id: 1, hasLeftChild: false, left: null })

    const { cells } = layoutTree(root)

    expect(cell(cells, "root-LEFT").kind).toBe("empty")
  })

  it("une feuille AVEC enfant déclaré mais non chargé rend une branche TRONQUÉE", () => {
    // Le nœud existe côté serveur (`hasLeftChild`), il n'est simplement pas dans la réponse
    // bornée. La position est donc OCCUPÉE — surtout ne pas l'annoncer comme libre.
    const root = node({ id: 1, hasLeftChild: true, left: null })

    const { cells } = layoutTree(root)

    expect(cell(cells, "root-LEFT").kind).toBe("truncated")
  })

  it("au DERNIER niveau affiché, un enfant réel ne produit aucune case", () => {
    // On s'arrête à la borne : les enfants du niveau 2 ne sont pas placés du tout, ni comme
    // libres ni comme tronqués. C'est le recentrage qui les révèle.
    const deep = node({
      id: 1,
      hasLeftChild: true,
      left: node({
        id: 2,
        hasLeftChild: true,
        left: node({ id: 3, hasLeftChild: true, left: node({ id: 4 }) }),
      }),
    })

    const { cells } = layoutTree(deep)

    expect(cells.every((c) => c.level < VISIBLE_LEVELS)).toBe(true)
    expect(cells.some((c) => c.key === "root-LEFT-LEFT-LEFT")).toBe(false)
  })
})

describe("layoutTree — on ne descend PAS sous une place libre", () => {
  it("une racine seule ne rend que trois cases, pas sept", () => {
    // Et c'est voulu : sous une position VIDE, il n'existe aucune position à proposer. Dessiner
    // quatre places libres au niveau 2 sous un niveau 1 inoccupé inviterait à placer un filleul
    // à une profondeur qui n'existe pas — on ne peut se rattacher qu'à quelqu'un.
    const { cells } = layoutTree(node({ id: 1 }))

    expect(cells).toHaveLength(3)
    expect(cells.filter((c) => c.level === 2)).toHaveLength(0)
  })

  it("une branche TRONQUÉE ne se déplie pas davantage", () => {
    // Même raison : ce qu'il y a en dessous n'est pas connu de cette réponse, et l'inventer
    // serait pire que ne rien montrer. C'est le recentrage qui va le chercher.
    const root = node({ id: 1, hasLeftChild: true, left: null })

    const { cells } = layoutTree(root)

    expect(cells.some((c) => c.key.startsWith("root-LEFT-"))).toBe(false)
  })
})

describe("layoutTree — géométrie", () => {
  it("un arbre plein rend exactement les 7 cases des trois niveaux", () => {
    // 1 + 2 + 4 : la grille est FIXE, un arbre déséquilibré ne fait pas glisser les branches
    // voisines d'un rendu à l'autre.
    const { cells } = layoutTree(fullTree())

    expect(cells).toHaveLength(7)
    expect(cells.filter((c) => c.level === 0)).toHaveLength(1)
    expect(cells.filter((c) => c.level === 1)).toHaveLength(2)
    expect(cells.filter((c) => c.level === 2)).toHaveLength(4)
  })

  it("un parent est centré au-dessus de ses deux enfants", () => {
    const root = node({
      id: 1,
      hasLeftChild: true,
      hasRightChild: true,
      left: node({ id: 2 }),
      right: node({ id: 3 }),
    })

    const { cells } = layoutTree(root)
    const parent = cell(cells, "root")
    const left = cell(cells, "root-LEFT")
    const right = cell(cells, "root-RIGHT")

    const centre = (c: PlacedCell) => c.x + TREE_CANVAS.nodeWidth / 2
    expect(centre(parent)).toBeCloseTo((centre(left) + centre(right)) / 2)
  })

  it("aucune case ne déborde du dessin", () => {
    const { cells } = layoutTree(fullTree())

    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x + TREE_CANVAS.nodeWidth).toBeLessThanOrEqual(TREE_CANVAS.width)
      expect(c.y + TREE_CANVAS.nodeHeight).toBeLessThanOrEqual(TREE_CANVAS.height)
    }
  })

  it("les niveaux ne se chevauchent pas verticalement", () => {
    const { cells } = layoutTree(fullTree())
    const rows = [0, 1, 2].map((level) => cells.find((c) => c.level === level)!.y)

    expect(rows[1]).toBeGreaterThanOrEqual(rows[0] + TREE_CANVAS.nodeHeight)
    expect(rows[2]).toBeGreaterThanOrEqual(rows[1] + TREE_CANVAS.nodeHeight)
  })
})

describe("layoutTree — la jambe portée par chaque case", () => {
  it("la racine n'a pas de jambe, ses descendants en ont une", () => {
    const { cells } = layoutTree(fullTree())

    expect(cell(cells, "root").leg).toBeNull()
    expect(cell(cells, "root-LEFT").leg).toBe("LEFT")
    expect(cell(cells, "root-RIGHT").leg).toBe("RIGHT")
    // Un nœud en jambe GAUCHE d'un upline lui-même en jambe DROITE porte bien « gauche » :
    // c'est sa position sous SON parent, pas sous la racine (tree.md).
    expect(cell(cells, "root-RIGHT-LEFT").leg).toBe("LEFT")
  })
})

describe("layoutTree — traits de liaison", () => {
  it("il y a un trait par lien possible des niveaux non terminaux", () => {
    // 2 depuis la racine + 2 par nœud du niveau 1 = 6, sur un arbre plein.
    expect(layoutTree(fullTree()).connectors).toHaveLength(6)
    // Sur une racine seule, il n'y a que ses deux liens : rien ne pend sous une place libre.
    expect(layoutTree(node({ id: 1 })).connectors).toHaveLength(2)
  })

  it("un trait est PLEIN vers quelqu'un, POINTILLÉ vers une place libre", () => {
    const root = node({ id: 1, hasLeftChild: true, left: node({ id: 2 }) })

    const { connectors } = layoutTree(root)
    const left = connectors.find((c) => c.key === "root-LEFT")!
    const right = connectors.find((c) => c.key === "root-RIGHT")!

    expect(left.filled).toBe(true)
    expect(right.filled).toBe(false)
  })

  it("le chemin est ORTHOGONAL — descente, traversée, descente", () => {
    // Une diagonale rendrait deux branches voisines difficiles à suivre du regard.
    const { connectors } = layoutTree(fullTree())

    for (const connector of connectors) {
      expect(connector.d).toMatch(/^M [\d.]+ [\d.]+ V [\d.]+ H [\d.]+ V [\d.]+$/)
    }
  })

  it("chaque trait part du bas du parent et arrive en haut de l'enfant", () => {
    const { cells, connectors } = layoutTree(fullTree())
    const parent = cell(cells, "root")
    const child = cell(cells, "root-LEFT")
    const connector = connectors.find((c) => c.key === "root-LEFT")!

    const [, startY] = connector.d.match(/^M [\d.]+ ([\d.]+)/)!
    const [, endY] = connector.d.match(/V ([\d.]+)$/)!

    expect(Number(startY)).toBe(parent.y + TREE_CANVAS.nodeHeight)
    expect(Number(endY)).toBe(child.y)
  })
})
