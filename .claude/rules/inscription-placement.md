# Règle — Inscription, placement, cycle de vie

> Source : `docs/spec.md` §5.2, §5.3, §5.4, §5.9, §9.1. Voir D-013 (remplace l'ancien modèle de
> réservation) et **D-036 à D-039** (Tranche 7.5 : frais d'inscription par e-card, acompte,
> renouvellement en deux temps, numéro de pièce d'identité).

## Plus AUCUN montant d'adhésion ne se règle « en espèces hors système » (D-036, D-038)
Inscription (100 DT) comme renouvellement annuel (100 DT) se paient par **e-card(s)** — total
**exact**, cartes cumulables (D-030), plafonnées en nombre (D-040). Les deux montants sont
paramétrables (`registration_fee_dt`, `annual_renewal_dt`) et **figés au paiement** : changer
le tarif demain ne réécrit aucun versement passé. Le grand livre reste muet — l'e-card paie,
elle ne recharge aucun solde (D-025).

## Deux liens distincts
- **Sponsor** (parrain) : qui a référé le membre → déclenche la **commission directe**.
- **Upline de placement** : sous quel membre et sur quelle **jambe (G/D)** le membre est rattaché dans l'arbre → déclenche le **binaire**.
Ils peuvent désigner des membres différents. Les deux sont saisis à l'inscription.

## Placement
- **Explicite** : le sponsor choisit l'upline et la jambe. **Aucun spillover** (débordement automatique). Si la position est occupée, choisir une autre position libre.
- L'upline choisi doit appartenir au **sous-arbre du sponsor** (ou être le sponsor lui-même) — décision D-022.
- **Immuable** dès l'inscription.
- Seule l'**activation** injecte des **points** dans l'arbre (l'arbre ne voit jamais de dinar — D-028) : la valeur du **palier** (en points) du nouveau membre est ajoutée à la jambe concernée de **chacun de ses uplines, quel que soit leur état, jusqu'à la racine** (décision D-020 — l'ancienne formulation « uplines actifs » désignait qui est *rémunéré*, pas qui est *crédité*). Le palier crédité est celui **figé au snapshot d'activation**, jamais le palier vivant du pack. (Le montant *payé*, lui, est le prix du pack en DT — D-029 — mais il ne monte pas dans l'arbre.)
- Les **achats de produits n'alimentent pas** l'arbre.

## Cycle de vie (états)
- **INSCRIT** : formulaire soumis, **frais d'inscription réglés par e-card(s)** (D-036) dans la MÊME transaction que la création, **code attribué immédiatement** (`NP` + numéro auto-incrémenté), **placement définitif**. Le membre existe dans l'arbre et peut recevoir des downlines G/D. **Persiste indéfiniment** (pas d'expiration). Aucun point, aucun solde, aucune commission — mais un **acompte** figé (`registrationPaidDt`).
- **ACTIF** : achat par e-card finalisé (panier au **palier exact en points**, e-cards totalisant le **prix du pack MOINS l'acompte d'inscription**, en DT — D-029 + D-037). Les **points** du palier sont injectés vers les uplines, **entiers** : l'acompte ne touche que l'argent. **Baseline figée** (la réserve appariable démarre à zéro — D-035) et les événements de commission de l'activation sont écrits dans la même transaction. Entre dans le calcul des commissions. **Activation automatique, sans validation admin.**
- **INACTIF** : membre actif n'ayant pas renouvelé (annuel, 100 DT par e-card, **validé par l'admin** — D-038). Ne perçoit plus de commissions jusqu'à régularisation.

## Atomicité de l'inscription (D-036) — invariant
Membre + `MembershipPayment` + consommation des e-cards committent **ensemble ou pas du tout**.
Jamais d'e-card brûlée sans membre créé, jamais de membre créé sans e-cards brûlées. Position
occupée, sponsor inconnu, upline hors sous-arbre : le rollback Postgres rend les cartes
`ACTIVE`, réutilisables telles quelles. Ordre de verrouillage : `Member` (l'INSERT, qui prend
un `FOR KEY SHARE` sur sponsor et upline) **avant** `Ecard` (ids croissants) — D-024.

## Renouvellement annuel : DEUX temps (D-038)
1. **Le membre paie** (`RenewalService.pay`) : e-cards brûlées, `MembershipPayment` en
   `PENDING_VALIDATION`. **Le statut du membre ne bouge pas** — un gelé reste gelé et ne
   perçoit toujours rien. Un ACTIF peut payer par anticipation ; un INSCRIT est refusé (il n'a
   jamais activé). Un second paiement pendant qu'un autre attend est refusé : il brûlerait des
   cartes pour rien.
2. **L'admin valide** (`RenewalService.validate`, SUPER_ADMIN/MANAGER) : `UPDATE` gardé sur
   `PENDING_VALIDATION` — non rejouable. Si le membre est INACTIF → réactivation D-034
   (nouvelle baseline, **carry-over d'avant gel conservé**) ; s'il est ACTIF → seule
   `renewalAt` est repoussée, **surtout pas de nouvelle baseline** (il n'a jamais cessé
   d'apparier, la figer lui coûterait son carry-over en cours).

**Point ouvert** : aucun chemin de REFUS n'existe (les cartes sont déjà brûlées — que devient
la valeur ?). À trancher avec la cliente avant de l'implémenter.

## Identité (D-018, D-039) — jamais bloquante
Type de pièce + **numéro saisi à la main** + image, collectés à l'inscription. `PENDING` par
défaut ; l'admin compare le numéro à l'image et appose le badge (T8). **Rien de tout cela ne
bloque quoi que ce soit** : un membre `PENDING` s'inscrit, s'active, perçoit et renouvelle
normalement. À distinguer de la validation du renouvellement, elle bloquante.

## Points clés
- Il n'existe **ni délai, ni état EXPIRÉ, ni cron de libération** (décision D-013).
- **Baseline** : seuls les points arrivés après l'activation comptent pour les commissions propres du membre.
- Composition du pack : somme des **points** des produits = **exactement** le palier.

## Tests attendus
- Inscription (e-cards au total exact) → membre INSCRIT avec code, place et acompte figé, sans point ni solde ; cartes `USED`.
- Total ≠ frais (au-dessus comme au-dessous) → refus, cartes `ACTIVE`.
- Plusieurs e-cards cumulées (50 + 50) → acceptées.
- Deux inscriptions sur la même position → la première gagne.
- Inscription échouant APRÈS le paiement (position prise) → cartes `ACTIVE`, aucun membre, aucun paiement orphelin, carte réutilisable ensuite.
- Deux inscriptions concurrentes avec la MÊME e-card → exactement une réussit.
- Activation → baseline figée, points antérieurs exclus, montant dû = prix − acompte, palier crédité entier.
- L'acompte utilisé est celui SNAPSHOTÉ, même si le paramètre a changé depuis.
- Renouvellement payé mais non validé → membre toujours gelé, aucune commission ; validé → réactivé, nouvelle baseline, carry-over d'avant conservé.
- Membre `PENDING` (numéro saisi + image) → s'inscrit et s'active normalement.
