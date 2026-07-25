import { Leg, MemberStatus } from '@prisma/client';
import {
  buildNetworkPlan,
  PlannedMember,
  SEED_NETWORK_SIZE,
  summarizePlan,
} from './network-plan';

/**
 * Le plan est le contrat du seed : s'il est faux, le réseau amorcé l'est aussi — et un arbre
 * faux ne se voit qu'au moment où le moteur de commissions verse de l'argent qu'il ne devrait
 * pas. Ces tests portent sur les invariants qui rendent le plan EXÉCUTABLE par les vrais
 * services : racine unique, ordre top-down, positions libres, D-022.
 */
describe('Plan du réseau d’amorçage (500 membres, arbre unique)', () => {
  const plan = buildNetworkPlan();

  const uplineOf = (node: PlannedMember) =>
    node.uplineIndex === null ? null : plan[node.uplineIndex];

  /** Remonte la chaîne des uplines jusqu'à la racine. */
  const ancestorsOf = (node: PlannedMember): PlannedMember[] => {
    const chain: PlannedMember[] = [];
    let current = uplineOf(node);
    let guard = 0;
    while (current && guard < 1000) {
      chain.push(current);
      current = uplineOf(current);
      guard += 1;
    }
    return chain;
  };

  it('produit exactement 500 membres', () => {
    expect(plan).toHaveLength(SEED_NETWORK_SIZE);
    expect(plan.map((node) => node.index)).toEqual(
      Array.from({ length: SEED_NETWORK_SIZE }, (_, i) => i),
    );
  });

  it('UNE seule racine, et tout le monde en descend', () => {
    const roots = plan.filter((node) => node.uplineIndex === null);
    expect(roots).toHaveLength(1);
    expect(roots[0].index).toBe(0);
    expect(roots[0].leg).toBeNull();
    expect(roots[0].sponsorIndex).toBeNull();

    // Chaque membre atteint la racine en remontant : aucun sous-arbre détaché, aucun cycle.
    for (const node of plan.slice(1)) {
      const chain = ancestorsOf(node);
      expect(chain[chain.length - 1].index).toBe(0);
      expect(chain).toHaveLength(node.depth);
    }
  });

  it('ordre TOP-DOWN : un upline précède toujours son filleul', () => {
    for (const node of plan.slice(1)) {
      expect(node.uplineIndex).not.toBeNull();
      expect(node.uplineIndex!).toBeLessThan(node.index);
      expect(node.sponsorIndex!).toBeLessThan(node.index);
    }
  });

  it('aucune position occupée deux fois (pas de spillover à rattraper)', () => {
    const taken = new Set<string>();
    for (const node of plan.slice(1)) {
      const key = `${node.uplineIndex}:${node.leg}`;
      expect(taken.has(key)).toBe(false);
      taken.add(key);
      expect([Leg.LEFT, Leg.RIGHT]).toContain(node.leg);
    }
  });

  it('D-022 : l’upline appartient toujours au sous-arbre du sponsor', () => {
    for (const node of plan.slice(1)) {
      const upline = uplineOf(node)!;
      const sponsorIndex = node.sponsorIndex!;
      const onPath =
        sponsorIndex === upline.index ||
        ancestorsOf(upline).some((a) => a.index === sponsorIndex);
      expect(onPath).toBe(true);
    }
  });

  it('profondeurs cohérentes avec la chaîne d’uplines', () => {
    for (const node of plan) {
      const expected = node.uplineIndex === null ? 0 : plan[node.uplineIndex].depth + 1;
      expect(node.depth).toBe(expected);
    }
  });

  it('répartition des statuts : 350 actifs / 100 inscrits / 50 gelés, racine ACTIVE', () => {
    const stats = summarizePlan(plan);
    expect(stats.active).toBe(350);
    expect(stats.registered).toBe(100);
    expect(stats.inactive).toBe(50);
    expect(stats.total).toBe(SEED_NETWORK_SIZE);
    expect(plan[0].status).toBe(MemberStatus.ACTIVE);
  });

  it('pack pour tout membre activé, aucun pack pour un INSCRIT', () => {
    for (const node of plan) {
      if (node.status === MemberStatus.REGISTERED) {
        expect(node.packName).toBeNull();
      } else {
        expect(node.packName).not.toBeNull();
      }
    }
    const stats = summarizePlan(plan);
    const total = Object.values(stats.packs).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(stats.active + stats.inactive); // 400 activés
    expect(stats.packs.Silver).toBeGreaterThan(stats.packs.Gold);
    expect(stats.packs.Gold).toBeGreaterThan(stats.packs.Safari);
    expect(stats.packs.Safari).toBeGreaterThan(stats.packs.Diamond);
  });

  it('e-mails uniques', () => {
    const emails = new Set(plan.map((node) => node.email));
    expect(emails.size).toBe(SEED_NETWORK_SIZE);
    for (const email of emails) {
      expect(email).toMatch(/^[a-z0-9.-]+@najah\.local$/);
    }
  });

  it('déterministe : même graine → plan identique, graine différente → autre arbre', () => {
    expect(buildNetworkPlan()).toEqual(plan);
    const other = buildNetworkPlan({ seed: 1234 });
    expect(other).toHaveLength(SEED_NETWORK_SIZE);
    expect(other).not.toEqual(plan);
  });

  it('forme plausible : ni filament, ni arbre parfait', () => {
    const stats = summarizePlan(plan);
    // Un arbre parfait de 500 nœuds aurait une profondeur de 8 ; un filament, de 499.
    expect(stats.maxDepth).toBeGreaterThan(8);
    expect(stats.maxDepth).toBeLessThan(40);

    // Les deux jambes de la racine sont peuplées, et aucune n'écrase l'autre.
    const legOf = (start: PlannedMember) => {
      let current: PlannedMember | null = start;
      let leg: Leg | null = null;
      while (current && current.uplineIndex !== null) {
        leg = current.leg;
        current = uplineOf(current);
      }
      return leg;
    };
    const left = plan.slice(1).filter((n) => legOf(n) === Leg.LEFT).length;
    const right = plan.slice(1).filter((n) => legOf(n) === Leg.RIGHT).length;
    expect(left).toBeGreaterThan(50);
    expect(right).toBeGreaterThan(50);
    expect(left + right).toBe(SEED_NETWORK_SIZE - 1);
  });

  it('taille paramétrable (les tests d’intégration s’en servent)', () => {
    const small = buildNetworkPlan({ size: 25 });
    expect(small).toHaveLength(25);
    expect(small.filter((n) => n.uplineIndex === null)).toHaveLength(1);
  });
});
