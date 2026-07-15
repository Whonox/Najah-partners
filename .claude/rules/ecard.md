# Règle — E-cards

> Source : `docs/spec.md` §5.5, §9.2 ; décisions D-007, D-008, **D-025** (modèle de consommation), **D-026** (prolongation), **D-028** (une e-card est de l'argent — DT). Implémentée en Tranche 5, unité corrigée en Tranche 6.5.

## Unité : le DINAR (D-028)
Une e-card est de l'**argent** : sa valeur (`valueDt`) est en **DT** (`Decimal(12,3)`), débitée du
solde DT du créateur à l'émission. Elle ne porte jamais de points — les points n'entrent dans
l'arbre que par une activation (D-005). À l'**activation**, l'e-card paie le **prix du pack**
(D-029), pas le palier ; en achat **libre**, la somme des prix DT du panier.

## Modèle : instrument de PAIEMENT, jamais recharge de solde (D-025)
Utiliser une e-card ne crédite **jamais** le solde du bénéficiaire. La valeur sort du solde du créateur à l'émission, vit dans la carte, et **quitte le système** à la consommation (elle paie l'activation, puis l'achat en T6).
Il n'existe donc **aucune ligne de grand livre à la consommation** — aucun solde ne bouge — et **aucune valeur `ECARD_USE`** dans `LedgerMovementType` (supprimée de l'enum : la conserver rouvrirait le modèle recharge).
Conséquence : c'est la stratégie de paiement (`ActivationPayment.settleInTx`) qui règle le **prix du pack** (en DT, D-029), pas `ActivationService`.

## Verrouillage (D-024)
Ordre inter-tables **`Member` → `Ecard`**, sans exception. Toute opération qui rembourse écrit donc le mouvement de solde (qui verrouille le membre) **avant** de revendiquer l'e-card par un `UPDATE` gardé (`WHERE status = 'ACTIVE'` → 0 ligne = la carte a changé d'état → rollback, remboursement compris). Revendiquer la carte d'abord croiserait l'ordre de l'activation (chaîne d'ancêtres verrouillée, puis carte brûlée) et rouvrirait l'interblocage de la Tranche 4.

- **Format** : `XXX-XXX-XXX-XXX` (4 groupes de 3 caractères alphanumériques, ex. `HHD-7Z7-JJD-77D`). Unicité garantie (régénérer en cas de collision). Génération aléatoire non prédictible. Distinct du code membre (`NP` + numéro auto-incrémenté).
- **Libellé en DT** (D-028). Une e-card porte une valeur en dinars.
- **Création plafonnée** au solde DT disponible du créateur. La création **débite immédiatement** le solde et met l'e-card à `ACTIVE`.
- **Transférable, usage unique.** Transmise à un autre membre (cash réglé hors système). Brûlée (`USED`) après utilisation ; irréversible.
- **Couverture exacte** : un achat par e-card exige une valeur **égale exactement** au montant DT dû (au millime). Pas de trop-perçu, une seule e-card par transaction.
- **Expiration paramétrable** en jours (`ecard_expiration_days`, seedé à 180 — à confirmer) ; `-1` = illimité. À `EXPIRED` (cron quotidien, 03:00 Tunis) comme à `REVOKED` (révocation admin), la valeur (DT) est **recréditée au créateur**. L'échéance fait foi **avant** le passage du cron : une carte échue est déjà refusée à la consommation.
- **Prolonger** (D-026) : le **créateur** (ses propres e-cards `ACTIVE`) et l'**admin** (SUPER_ADMIN/MANAGER, n'importe laquelle), borné à 365 j. Seule une `ACTIVE` se prolonge — ressusciter une `EXPIRED`/`REVOKED` déjà remboursée créerait de l’argent.
- **Genèse du réseau** : l'admin (**SUPER_ADMIN** seul — création de valeur, D-017b) peut générer des e-cards ex nihilo, sans créateur ni débit. Contrepartie : à leur expiration/révocation, **personne n'est remboursé** (invariant en base : CHECK `Ecard_origin_creator_ck`).
- **Sécurité des codes** : jamais de code en clair dans un log, un message d'erreur ou une ligne d'`AuditLog` (on trace `Ecard:<id>`).

## Machine à états
`ACTIVE → USED` (achat) · `ACTIVE → EXPIRED` (échéance, rembourse le créateur) · `ACTIVE → REVOKED` (admin, rembourse le créateur). `USED` est définitif.

## Sécurité
Les codes = de la valeur : rate-limiting sur la validation (anti-brute-force), consommation atomique (l'e-card n'est brûlée que si l'achat aboutit entièrement ; un achat interrompu la laisse `ACTIVE`).

## Tests attendus
- Création > solde → refusée.
- Création puis achat exact → e-card `USED`, solde débité une seule fois.
- Achat avec valeur ≠ montant dû → refusé.
- Expiration/révocation → valeur (DT) recréditée au créateur, e-card non réutilisable.
