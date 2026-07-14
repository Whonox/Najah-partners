import { Leg, MemberStatus } from '@prisma/client';
import { TreeRow } from './members.types';
import { buildTree } from './tree.builder';

/**
 * Assemblage de l'arbre imbriqué à partir des lignes plates de la CTE descendante.
 * Fonction pure : aucune base, aucun mock.
 */

function row(
  id: number,
  depth: number,
  uplineId: number | null,
  leg: Leg | null,
): TreeRow {
  return {
    id,
    depth,
    uplineId,
    leg,
    memberCode: `NP${String(id).padStart(6, '0')}`,
    firstName: `M${id}`,
    lastName: 'Test',
    status: MemberStatus.ACTIVE,
    packName: 'Silver',
    activatedAt: null,
    leftPoints: 0,
    rightPoints: 0,
  };
}

describe('buildTree', () => {
  it('sans ligne : aucun arbre', () => {
    expect(buildTree([])).toBeNull();
  });

  it('rattache chaque enfant à la jambe déclarée par son parent', () => {
    // 1 ─┬─ (G) 2 ─┬─ (G) 4
    //    │         └─ (D) 5
    //    └─ (D) 3
    const tree = buildTree([
      row(1, 0, 99, Leg.LEFT), // la racine demandée a un upline HORS du sous-arbre
      row(2, 1, 1, Leg.LEFT),
      row(3, 1, 1, Leg.RIGHT),
      row(4, 2, 2, Leg.LEFT),
      row(5, 2, 2, Leg.RIGHT),
    ]);

    expect(tree!.id).toBe(1);
    expect(tree!.left!.id).toBe(2);
    expect(tree!.right!.id).toBe(3);
    expect(tree!.left!.left!.id).toBe(4);
    expect(tree!.left!.right!.id).toBe(5);
    expect(tree!.right!.left).toBeNull();
    expect(tree!.right!.right).toBeNull();
  });

  it('un membre sans downline reste une feuille (jambes nulles)', () => {
    const tree = buildTree([row(1, 0, null, null)]);
    expect(tree!.left).toBeNull();
    expect(tree!.right).toBeNull();
  });
});
