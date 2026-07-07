# Règle — Moteur de commissions

> Source : `docs/spec.md` §5.8, §6, §10. Cette règle est le cœur métier : tout changement passe d'abord par la spec et `docs/decisions.md`.

## Cadre

- Calcul **hebdomadaire** par cron. Clôture le **vendredi 23:59, heure de Tunis** (UTC+1, pas de changement d'heure → bornes déterministes).
- Les membres **INSCRIT** (non activés) sont ignorés : pas de compteur de commissions.
- Tous les montants sont en **BV**.

## Plan de rémunération (paramétrable, valeurs par défaut)

| Pack | Palier | Comm. directe | Comm. indirecte (par cycle) | Plafond hebdo |
|---|---|---|---|---|
| Silver | 1000 | 500 | 250 | 10000 |
| Gold | 2000 | 700 | 400 | 16000 |
| Safari | 3000 | 900 | 600 | 24000 |
| Diamond | 4000 | 1200 | 900 | 36000 |

## Algorithme (par membre ACTIF, chaque semaine)

1. **Baseline** : ne compter que les points arrivés après l'activation du membre (baseline figée à l'activation, soustraite une seule fois).
2. **Totaux par jambe** : `totalG = reportG + semaineG` ; `totalD = reportD + semaineD`.
3. **Cycles équilibrés** : `matched = min(totalG, totalD)` ; `nbCycles = floor(matched / palier)`.
4. **Commission indirecte (équilibre)** = `nbCycles × commIndirecte`. Consommé = `nbCycles × palier` sur chaque jambe.
5. **Bonus de démarrage** : `reste = bonusDemarrageRestant` (défaut initial 6). Sur l'excédent de la jambe forte après les cycles : `nbBonus = min(reste, floor(excedentJambeForte / palier))`. Bonus = `nbBonus × commIndirecte`. Décrémenter `bonusDemarrageRestant` de `nbBonus` et consommer `nbBonus × palier` sur la jambe forte.
6. **Report** : les points restants (non appariés et non payés au bonus) sont reportés à la semaine suivante.
7. **Commission directe** = somme sur les filleuls activés dans la période de `commDirecte(pack du filleul)`.
8. **Total** = directe + indirecte + bonus. Si `Total > plafond` : verser `plafond`, l'excédent est **perdu** (non reporté).
9. **Crédit** : montant retenu crédité en BV au solde (grand livre) ; chaque ligne de commission fige ses paramètres (snapshot).

## Deux « débordements » à ne PAS confondre

- Points non appariés de la jambe forte → **REPORTÉS** (sauf ceux payés au bonus, qui sont consommés).
- Commission au-delà du plafond hebdo → **PERDUE** (jamais reportée).

## Tests attendus (déterministes, à écrire avant de considérer le module terminé)

- Silver, G 3000 / D 2000, bonus épuisé → 2 cycles, 500 BV indirect, report 1000 à gauche.
- Silver, G 3000 / D 0, bonus restant 6 → 3 paliers de bonus payés (750 BV), bonusRestant passe à 3, 0 reporté.
- Plafond : total calculé > plafond du pack → versé = plafond, excédent perdu, vérifier qu'aucun report de commission.
- Baseline : points présents avant activation non comptés ; seuls les points postérieurs génèrent des cycles.
- Membre INSCRIT : ignoré par le run (aucune commission).
- Snapshot : modifier un paramètre de pack après un run ne change pas les commissions déjà calculées.
