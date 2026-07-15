# Règle — Moteur de commissions

> Source : `docs/spec.md` §5.8, §6, §10. Cette règle est le cœur métier : tout changement passe d'abord par la spec et `docs/decisions.md`.

## Cadre

- Calcul **hebdomadaire** par cron. Clôture le **vendredi 23:59, heure de Tunis** (UTC+1, pas de changement d'heure → bornes déterministes).
- Les membres **INSCRIT** (non activés) sont ignorés : pas de compteur de commissions.
- **Deux dimensions (D-028)** : les **jambes, le palier et les cycles** se comptent en **POINTS** ; les **commissions versées et le plafond** sont en **DINARS**. On ne convertit jamais l'un en l'autre — le nombre de cycles (points) multiplie un montant par cycle (DT). Colonnes : `Pack.tierBv` (Int, points) ; `directCommissionDt` / `indirectCommissionDt` / `weeklyCapDt` (`Decimal(12,3)`, DT).

## Plan de rémunération (paramétrable, valeurs par défaut — D-028/D-029)

| Pack | Palier (points) | Comm. directe (DT) | Comm. indirecte /cycle (DT) | Plafond hebdo (DT) |
|---|---|---|---|---|
| Silver | 1000 | 500 | 250 | 10000 |
| Gold | 2000 | 700 | 400 | 16000 |
| Safari | 3000 | 900 | 600 | 24000 |
| Diamond | 4000 | 1200 | 900 | 36000 |

*(Le prix du pack — Silver 2200 DT, etc. — sert à l'activation, D-029 ; il n'entre pas dans le calcul des commissions.)*

## Algorithme (par membre ACTIF, chaque semaine)

1. **Baseline** : ne compter que les points arrivés après l'activation du membre (baseline figée à l'activation, soustraite une seule fois).
2. **Totaux par jambe** : `totalG = reportG + semaineG` ; `totalD = reportD + semaineD`.
3. **Cycles équilibrés** : `matched = min(totalG, totalD)` ; `nbCycles = floor(matched / palier)`.
4. **Commission indirecte (équilibre)** = `nbCycles × commIndirecte`. Consommé = `nbCycles × palier` sur chaque jambe.
5. **Bonus de démarrage** : `reste = bonusDemarrageRestant` (défaut initial 6). Sur l'excédent de la jambe forte après les cycles : `nbBonus = min(reste, floor(excedentJambeForte / palier))`. Bonus = `nbBonus × commIndirecte`. Décrémenter `bonusDemarrageRestant` de `nbBonus` et consommer `nbBonus × palier` sur la jambe forte.
6. **Report** : les points restants (non appariés et non payés au bonus) sont reportés à la semaine suivante.
7. **Commission directe** = somme sur les filleuls activés dans la période de `commDirecte(pack du filleul)`.
8. **Total** = directe + indirecte + bonus. Si `Total > plafond` : verser `plafond`, l'excédent est **perdu** (non reporté).
9. **Crédit** : montant retenu crédité en **DT** au solde (grand livre) ; chaque ligne de commission fige ses paramètres (snapshot).

> Cycles et paliers en points ; `commIndirecte`, `commDirecte`, plafond et crédit en dinars. Le pont entre les deux est une multiplication `nbCycles (points) × montant/cycle (DT)`, jamais une conversion d'unité.

## Deux « débordements » à ne PAS confondre

- Points non appariés de la jambe forte → **REPORTÉS** (sauf ceux payés au bonus, qui sont consommés).
- Commission au-delà du plafond hebdo → **PERDUE** (jamais reportée).

## Tests attendus (déterministes, à écrire avant de considérer le module terminé)

- Silver, G 3000 / D 2000 (points), bonus épuisé → 2 cycles, **500 DT** indirect, report 1000 points à gauche.
- Silver, G 3000 / D 0 (points), bonus restant 6 → 3 paliers de bonus payés (**750 DT**), bonusRestant passe à 3, 0 reporté.
- Plafond : total calculé > plafond du pack → versé = plafond, excédent perdu, vérifier qu'aucun report de commission.
- Baseline : points présents avant activation non comptés ; seuls les points postérieurs génèrent des cycles.
- Membre INSCRIT : ignoré par le run (aucune commission).
- Snapshot : modifier un paramètre de pack après un run ne change pas les commissions déjà calculées.
