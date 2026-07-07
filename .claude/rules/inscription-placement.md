# Règle — Inscription, placement, cycle de vie

> Source : `docs/spec.md` §5.2, §5.3, §5.4, §9.1. Voir décision D-013 (remplace l'ancien modèle de réservation).

## Deux liens distincts
- **Sponsor** (parrain) : qui a référé le membre → déclenche la **commission directe**.
- **Upline de placement** : sous quel membre et sur quelle **jambe (G/D)** le membre est rattaché dans l'arbre → déclenche le **binaire**.
Ils peuvent désigner des membres différents. Les deux sont saisis à l'inscription.

## Placement
- **Explicite** : le sponsor choisit l'upline et la jambe. **Aucun spillover** (débordement automatique). Si la position est occupée, choisir une autre position libre.
- **Immuable** dès l'inscription.
- Seule l'**activation** injecte du BV dans l'arbre : la valeur du **palier** du nouveau membre est ajoutée à la jambe concernée de chacun de ses uplines **actifs**, jusqu'à la racine.
- Les **achats de produits n'alimentent pas** l'arbre.

## Cycle de vie (états)
- **INSCRIT** : formulaire soumis, 100 DT réglés en espèces (hors système), **code attribué immédiatement** (`NP` + numéro auto-incrémenté), **placement définitif**. Le membre existe dans l'arbre et peut recevoir des downlines G/D. **Persiste indéfiniment** (pas d'expiration). Aucun BV, aucune commission.
- **ACTIF** : achat par e-card finalisé (panier au **palier exact**). BV du palier injecté vers les uplines actifs. **Baseline figée** + réserve de bonus de démarrage initialisée (défaut 6). Entre dans le calcul des commissions. **Activation automatique, sans validation admin.**
- **INACTIF** : membre actif n'ayant pas renouvelé (annuel, 100 DT, **validé par l'admin**). Ne perçoit plus de commissions jusqu'à régularisation.

## Points clés
- Il n'existe **ni délai, ni état EXPIRÉ, ni cron de libération** (décision D-013).
- **Baseline** : seuls les points arrivés après l'activation comptent pour les commissions propres du membre.
- Composition du pack : somme des BV des produits = **exactement** le palier.

## Tests attendus
- Inscription → membre INSCRIT avec code et place, sans BV.
- Deux inscriptions sur la même position → la première gagne.
- Activation → baseline figée, points antérieurs exclus du calcul du membre.
- Renouvellement non validé → INACTIF, aucune commission.
