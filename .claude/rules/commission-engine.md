# Règle — Moteur de commissions

> Source : `docs/spec.md` §5.8, §6, §10 ; décisions **D-031 à D-035** (D-031 **ANNULE D-012** —
> l'ancien bonus « réserve de 6 paliers déséquilibrés » n'existe plus, ni en code ni en base).
> Implémenté en Tranche 7 (`backend/src/commissions/`). Tout changement passe d'abord par la
> spec et `docs/decisions.md`.

## Architecture (D-035) — deux temps, pas de rejeu

Le moteur n'est PAS un moteur de recalcul : les événements de commission sont écrits **au fil
de l'eau**, pendant la remontée d'arbre de l'activation, dans la **même transaction** qu'elle
(`CommissionEventsService.recordActivationEventsInTx`, appelé par `ActivationService`).
Le run hebdomadaire ne fait plus qu'appliquer le plafond en chronologie et créditer.

- **Temps 1 — à l'activation.** La propagation (une seule instruction ensembliste, D-014/D-024)
  entretient trois compteurs par ancêtre : le **cumul à vie** des jambes (`leftPoints`/
  `rightPoints`, crédité quel que soit l'état — D-020), la **pool appariable**
  (`carriedLeftPoints`/`carriedRightPoints`, créditée **seulement si l'ancêtre est ACTIF**) et
  `activatedDescendants` (+1 partout). Son RETURNING fournit l'état sous verrou ; le service
  d'événements décide alors : équilibres complétés (`floor(min(poolG, poolD) / palier)` — un
  événement **par cycle**), bonus de démarrage, Points Fidélité. Les points appariés sont
  **consommés immédiatement** ; le reste des pools EST le carry-over (aucune colonne de report
  séparée, aucun reset hebdomadaire).
- **Temps 2 — run hebdo** (`CommissionRunService` + cron `59 23 * * 5`, `Africa/Tunis` — D-009 ;
  Tunis = UTC+1 fixe, la clôture est l'instant UTC « vendredi 22:59 », intervalle `[start, end)`).
  RÉCLAMATION `SET runId WHERE runId IS NULL` = barrière d'idempotence dure : relancer un run ne
  re-crédite jamais. Par membre (ids croissants — D-024), événements triés `(occurredAt, id)`,
  cumul au fil de l'eau, versement plafonné, crédit via `LedgerService.recordMovementInTx`
  (type `COMMISSION`), Points Fidélité sur `Member.rewardPoints`. UNE transaction pour tout le
  run ; l'échec rollback tout et persiste une trace `ERROR` hors transaction.

## La pool appariable rend baseline et gel corrects PAR CONSTRUCTION

- **Baseline (D-013)** : un INSCRIT n'a pas de pool (jamais créditée avant ACTIF) → ses points
  d'avant activation ne comptent jamais pour lui. `baselineLeft/Right` restent des instantanés
  documentaires (audit), figés à l'activation et à chaque réactivation.
- **Gel (D-034)** : un INACTIF ne reçoit rien en pool → les points du gel ne rapporteront
  jamais rien, mais ils **traversent** (cumul à vie + `activatedDescendants` montent, et les
  uplines ACTIFS au-dessus sont crédités normalement). Le **carry-over d'avant gel est
  conservé** (la pool n'est pas touchée par le gel ni par la réactivation). Aucun événement
  d'équilibre ne peut donc naître chez un gelé ; ses commissions DIRECTES naissent
  `eligible=false` — tracées, jamais payées. Gel/réactivation : `RenewalService`, dont le
  circuit de renouvellement (paiement par e-card **puis** validation admin — D-038) est en
  place depuis la Tranche 7.5 ; seul l'écran admin de la file d'attente reste à faire (T8).
  Payer ne dégèle pas : tant que l'admin n'a pas validé, le membre ne perçoit toujours rien.

## Événements (`CommissionEvent`) — décidés à l'instant, figés pour toujours

- `DIRECT` : pour le **sponsor** du membre activé, montant = `directCommissionDt` du pack
  **du filleul** (snapshot d'activation du filleul). Écrit **avant** les équilibres (D-033) :
  même `occurredAt` (timestamp de transaction), l'`id` porte l'ordre fin.
- `BALANCE` : un par équilibre complété, montant = `indirectCommissionDt` du snapshot de
  l'**ancêtre**, `balanceIndex` = n° d'équilibre **à vie** (D-032, jamais remis à zéro).
- `STARTUP_BONUS` (D-031) : à l'activation qui porte le sous-arbre d'un ancêtre ACTIF à
  **exactement 2 membres activés** (peu importe la jambe), s'il n'a jamais eu le bonus et que
  cette activation n'a pas déjà produit un équilibre naturel (le jalon est alors déjà payé —
  la fenêtre « exactement 2 » ne se représente jamais). Montant = `indirectCommissionDt`,
  consommation `min(palier, pool)` sur chaque jambe, `startupBonusUsed` à vie,
  **compte comme l'équilibre n°1**.
- `REWARD_POINT` (D-032) : chaque équilibre dont l'index à vie est un **multiple de 6** ne
  paie AUCUN dinar — il vaut **1 Point Fidélité** (`rewardPoints`, 3ᵉ unité : ni points BV,
  ni dinars ; leur dépense est hors scope). CHECK en base : `amountDt = 0`.
- `eligible` est évalué **au moment de l'événement** (D-034) : sponsor INSCRIT ou gelé →
  `false`, jamais payé — même si le bénéficiaire redevient ACTIF avant le run. Symétriquement,
  un événement éligible reste dû même si le membre gèle avant le run.

## Plafond hebdomadaire (D-033)

- Chronologie stricte : `(occurredAt, id)` ; sur une même activation, DIRECT avant BALANCE.
- Cumul au fil de l'eau ; versé = `min(cumul, plafond)` — l'événement qui franchit le plafond
  est payé **partiellement**, tout le reste de la semaine est **PERDU** (jamais reporté), y
  compris le Point Fidélité d'un `REWARD_POINT` survenu après le plafond. Les **points** d'un
  équilibre au-delà du plafond ont, eux, été consommés au temps 1 et le compteur à vie a
  avancé : seul l'argent (ou le Point Fidélité) se perd.
- Le plafond appliqué est `weeklyCapDt` du **snapshot d'activation du membre** — le moteur ne
  lit jamais `Pack` en direct (invariant T4/T6.5) : modifier un pack ne touche que les
  activations postérieures, jamais l'historique ni les membres déjà activés.
- L'acompte d'inscription (D-037, T7.5) n'entre **nulle part** ici : il ne touche que le
  montant encaissé à l'activation. Le palier propagé, les commissions et le plafond sont
  inchangés — le moteur n'a pas bougé d'une ligne.

## Deux « débordements » à ne PAS confondre

- Points non appariés → restent en **pool (carry-over)**, indéfiniment — jamais perdus.
- Commission au-delà du plafond hebdo → **PERDUE** (jamais reportée).

## Plan de rémunération (paramétrable, valeurs par défaut — D-028/D-029)

| Pack | Palier (points) | Prix (DT) | Comm. directe (DT) | Comm. indirecte /équilibre (DT) | Plafond hebdo (DT) |
|---|---|---|---|---|---|
| Silver | 1000 | 2200 | 500 | 250 | 10000 |
| Gold | 2000 | 3350 | 700 | 400 | 16000 |
| Safari | 3000 | 5400 | 900 | 600 | 24000 |
| Diamond | 4000 | 8350 | 1200 | 900 | 36000 |

## Tests (écrits en T7 — les scénarios font foi)

Unitaires (`balance-math.spec`, `settlement.spec`, `period.spec`) : cycles, règle du 6e,
consommation du bonus, plafond chronologique avec paiement partiel, Points Fidélité
accordés/perdus, bornes Tunis. Intégration (`commissions.int-spec`, vrai Postgres) :
équilibre simple, carry-over, bonus (même côté, une fois à vie, équilibre n°1), 6e/7e/12e,
plafond (excédent perdu, points consommés quand même), chronologie DIRECT-avant-BALANCE,
gel (rien perçu, points traversent), réactivation (nouvelle baseline, carry-over conservé),
INSCRIT ignoré, snapshot (modifier un pack ne réécrit rien), idempotence du run, atomicité
(activation interrompue → aucun événement orphelin).
