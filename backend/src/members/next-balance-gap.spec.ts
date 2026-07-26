import { Leg } from '@prisma/client';
import { MembersPortalService } from './members-portal.service';

/**
 * LA DISTANCE AU PROCHAIN ÉQUILIBRE (D-053, calculée côté serveur).
 *
 * Ce que ces tests tiennent :
 *  — l'écart se mesure sur le MINIMUM des deux réserves, jamais sur leur somme ni leur
 *    moyenne : c'est la définition même d'un équilibre (D-035). Un test qui passerait avec une
 *    somme signifierait que la règle a été recopiée de travers ;
 *  — les réserves APPARIABLES font foi, pas les cumuls à vie — ces derniers ne descendent
 *    jamais et diraient qu'on approche d'un palier déjà franchi dix fois. Ce point n'est pas
 *    testable ici (la fonction ne reçoit que les réserves) : c'est justement pourquoi elle ne
 *    reçoit QUE les réserves ;
 *  — `0` et `null` ne veulent pas dire la même chose, et l'écran en tire deux phrases
 *    opposées : « votre équilibre est acquis » contre « vous n'avez pas encore activé » ;
 *  — la jambe désignée est STABLE à égalité — une jambe qui change d'un rafraîchissement à
 *    l'autre ferait douter du conseil donné.
 */

// La méthode est privée : ces tests l'atteignent par le prototype, délibérément. La rendre
// publique pour la tester l'exposerait comme une API du service, ce qu'elle n'est pas.
type Gap = { pointsToNextBalance: number | null; weakestLeg: Leg | null };
const gap = (tier: number | null, left: number, right: number): Gap =>
  (
    MembersPortalService.prototype as unknown as {
      nextBalanceGap: (t: number | null, l: number, r: number) => Gap;
    }
  ).nextBalanceGap(tier, left, right);

describe('distance au prochain équilibre', () => {
  it('mesure l’écart sur la jambe la plus FAIBLE, et la désigne', () => {
    // Silver : palier 1000. Gauche 600, droite 900 → il manque 400 À GAUCHE.
    expect(gap(1000, 600, 900)).toEqual({
      pointsToNextBalance: 400,
      weakestLeg: Leg.LEFT,
    });
  });

  it('désigne la droite quand c’est elle qui traîne', () => {
    expect(gap(1000, 900, 600)).toEqual({
      pointsToNextBalance: 400,
      weakestLeg: Leg.RIGHT,
    });
  });

  it('n’additionne PAS les deux jambes — 600 + 900 ne fait pas un équilibre', () => {
    // Si l'on sommait, 1500 > 1000 rendrait 0. C'est le contresens le plus probable.
    expect(gap(1000, 600, 900).pointsToNextBalance).toBe(400);
  });

  it('ne fait pas de moyenne non plus', () => {
    // Moyenne de 0 et 1000 = 500 → rendrait 500. Le minimum, lui, est 0 → il manque 1000.
    expect(gap(1000, 0, 1000).pointsToNextBalance).toBe(1000);
  });

  it('rend 0 quand l’équilibre est ACQUIS — il sera constaté à la prochaine activation', () => {
    expect(gap(1000, 1000, 1000)).toEqual({
      pointsToNextBalance: 0,
      weakestLeg: null,
    });
  });

  it('rend 0 aussi quand les deux réserves DÉPASSENT le palier — jamais un négatif', () => {
    expect(gap(1000, 2500, 3000).pointsToNextBalance).toBe(0);
  });

  it('rend null — et non 0 — pour un membre qui n’a pas activé', () => {
    // `null` dit « la question ne se pose pas » ; `0` dirait « c'est acquis ». L'écran en tire
    // deux phrases opposées.
    expect(gap(null, 0, 0)).toEqual({
      pointsToNextBalance: null,
      weakestLeg: null,
    });
  });

  it('reste stable à égalité : toujours la même jambe désignée', () => {
    const first = gap(1000, 300, 300);
    const second = gap(1000, 300, 300);
    expect(first).toEqual(second);
    expect(first.weakestLeg).toBe(Leg.LEFT);
  });

  it('tient sur un palier Diamond', () => {
    expect(gap(4000, 4000, 1200)).toEqual({
      pointsToNextBalance: 2800,
      weakestLeg: Leg.RIGHT,
    });
  });
});
