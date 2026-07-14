import { Leg } from '@prisma/client';
import { TreeNode, TreeRow } from './members.types';

/**
 * Assemble l'arbre imbriqué à partir des lignes plates de la CTE descendante — en mémoire,
 * en O(n), sans jamais retourner en base (la requête récursive a déjà tout ramené).
 * La racine est la seule ligne de profondeur 0.
 */
export function buildTree(rows: TreeRow[]): TreeNode | null {
  if (rows.length === 0) {
    return null;
  }

  const nodes = new Map<number, TreeNode>();
  for (const row of rows) {
    nodes.set(row.id, { ...row, left: null, right: null });
  }

  let root: TreeNode | null = null;
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    const parent =
      row.uplineId !== null ? nodes.get(row.uplineId) : undefined;
    // Le parent d'un nœud de profondeur 0 n'est pas dans le résultat : c'est la racine
    // demandée (elle a un upline dans l'arbre global, hors du sous-arbre consulté).
    if (row.depth === 0 || !parent) {
      root ??= node;
      continue;
    }
    if (row.leg === Leg.LEFT) {
      parent.left = node;
    } else if (row.leg === Leg.RIGHT) {
      parent.right = node;
    }
  }

  return root;
}
