# Règle — E-cards

> Source : `docs/spec.md` §5.5, §9.2 ; décisions D-007, D-008, **D-025** (modèle de consommation), **D-026** (prolongation), **D-028** (une e-card est de l'argent — DT), **D-030/D-040/D-041** (cumul de plusieurs cartes, plafonné). Implémentée en Tranche 5, unité corrigée en Tranche 6.5, cumul généralisé en Tranche 7.5.

## Unité : le DINAR (D-028)
Une e-card est de l'**argent** : sa valeur (`valueDt`) est en **DT** (`Decimal(12,3)`), débitée du
solde DT du créateur à l'émission. Elle ne porte jamais de points — les points n'entrent dans
l'arbre que par une activation (D-005).

## L'e-card paie TOUT ce qui est dû — il n'y a plus d'espèces nulle part
Quatre montants, une seule mécanique de paiement :
- **inscription** — frais d'inscription (100 DT, D-036), qui valent **acompte** sur le pack ;
- **activation** — prix du pack **moins l'acompte** (D-029 + D-037 ; Silver : 2100 DT), pas le palier ;
- **achat libre** — somme des prix DT du panier ;
- **renouvellement annuel** — 100 DT (D-038), payés puis **validés par l'admin**.

## Cumul (D-030, révisé par D-040) : plusieurs cartes, somme EXACTE, nombre plafonné
Un paiement accepte **1..n e-cards** dont la **somme** doit égaler le montant dû **au millime**
— ni appoint, ni trop-perçu. Sans cumul, activer demanderait de trouver une carte de 2100 DT
pile, alors que les gains arrivent par petits montants : la règle « une seule carte » de D-007
est morte, la règle « couverture exacte » est intacte.

Trois refus non négociables :
- **doublon de code** dans un même paiement → refusé (sa valeur compterait deux fois pour une seule carte brûlée : de la valeur créée) ;
- **plus de `MAX_ECARDS_PER_PAYMENT` (10) cartes** → refusé (D-040 — sécurité, voir plus bas) ;
- **une carte du lot invalide** (inconnue, `USED`, expirée, révoquée) → **tout** le paiement est annulé, aucune carte n'est brûlée.

## Verrouillage (D-024) — étendu au cumul
Ordre inter-tables **`Member` → `Ecard` → `Product` → `Order`**. Depuis le cumul, les cartes
d'un même paiement sont brûlées **par `id` CROISSANT** : sans cet ordre total, deux paiements
concurrents tenant chacun une carte que l'autre convoite s'interbloqueraient. Même règle, même
raison que la chaîne d'ancêtres et que les produits.

Le lien e-card ↔ commande vit désormais côté **`Ecard.orderId`** (D-041) : 1 commande = 1..n
cartes, 1 carte = 0..1 commande. Il est posé **après** l'INSERT de la commande (les cartes sont
brûlées avant qu'elle n'existe), dans la même transaction. Une carte règle une commande **ou**
une adhésion (`membershipPaymentId`), jamais les deux — CHECK `Ecard_single_target_ck`.

## Modèle : instrument de PAIEMENT, jamais recharge de solde (D-025)
Utiliser une e-card ne crédite **jamais** le solde du bénéficiaire. La valeur sort du solde du créateur à l'émission, vit dans la carte, et **quitte le système** à la consommation (elle paie l'inscription, l'activation, l'achat libre ou le renouvellement).
Il n'existe donc **aucune ligne de grand livre à la consommation** — aucun solde ne bouge — et **aucune valeur `ECARD_USE`** dans `LedgerMovementType` (supprimée de l'enum : la conserver rouvrirait le modèle recharge).
Conséquence : c'est la stratégie de paiement (`ActivationPayment.settleInTx`) qui règle le **montant dû** (en DT — prix du pack moins l'acompte d'inscription, D-029 + D-037), pas `ActivationService`.

Toute opération qui **rembourse** écrit le mouvement de solde (qui verrouille le membre)
**avant** de revendiquer l'e-card par un `UPDATE` gardé (`WHERE status = 'ACTIVE'` → 0 ligne =
la carte a changé d'état → rollback, remboursement compris). Revendiquer la carte d'abord
croiserait l'ordre de l'activation et rouvrirait l'interblocage de la Tranche 4.

- **Format** : `XXX-XXX-XXX-XXX` (4 groupes de 3 caractères alphanumériques, ex. `HHD-7Z7-JJD-77D`). Unicité garantie (régénérer en cas de collision). Génération aléatoire non prédictible. Distinct du code membre (`NP` + numéro auto-incrémenté).
- **Libellé en DT** (D-028), à **valeur libre** (D-030) dans la limite du solde du créateur.
- **Création plafonnée** au solde DT disponible du créateur. La création **débite immédiatement** le solde et met l'e-card à `ACTIVE`.
- **Transférable, usage unique.** Transmise à un autre membre (cash réglé hors système). Brûlée (`USED`) après utilisation ; irréversible.
- **Couverture exacte** : un paiement par e-card(s) exige un **total égal exactement** au montant DT dû (au millime). Pas de trop-perçu, pas d'appoint.
- **Expiration paramétrable** en jours (`ecard_expiration_days`, seedé à 180 — à confirmer) ; `-1` = illimité. À `EXPIRED` (cron quotidien, 03:00 Tunis) comme à `REVOKED` (révocation admin), la valeur (DT) est **recréditée au créateur**. L'échéance fait foi **avant** le passage du cron : une carte échue est déjà refusée à la consommation.
- **Prolonger** (D-026) : le **créateur** (ses propres e-cards `ACTIVE`) et l'**admin** (SUPER_ADMIN/MANAGER, n'importe laquelle), borné à 365 j. Seule une `ACTIVE` se prolonge — ressusciter une `EXPIRED`/`REVOKED` déjà remboursée créerait de l’argent.
- **Genèse du réseau** : l'admin (**SUPER_ADMIN** seul — création de valeur, D-017b) peut générer des e-cards ex nihilo, sans créateur ni débit. Contrepartie : à leur expiration/révocation, **personne n'est remboursé** (invariant en base : CHECK `Ecard_origin_creator_ck`).
- **Sécurité des codes** : jamais de code en clair dans un log, un message d'erreur ou une ligne d'`AuditLog` (on trace `Ecard:<id>`).

## Machine à états
`ACTIVE → USED` (achat) · `ACTIVE → EXPIRED` (échéance, rembourse le créateur) · `ACTIVE → REVOKED` (admin, rembourse le créateur). `USED` est définitif.

## Sécurité
Les codes = de la valeur : rate-limiting sur toute route qui en accepte un (anti-brute-force),
consommation atomique (une e-card n'est brûlée que si la transaction aboutit **entièrement** ;
une opération interrompue la laisse `ACTIVE`).

**L'inscription est le point le plus exposé** (D-021 : public et anonyme ; D-036 : elle
consomme de la valeur). Quatre mesures, indissociables :
1. **Plafond de codes par requête** (`MAX_ECARDS_PER_PAYMENT` = 10, D-040) — le quota compte
   des REQUÊTES, pas des codes : sans plafond, une requête vaudrait autant d'essais qu'elle
   porte de champs. Plafond × quota = 50 essais/h/IP contre 32^12 ≈ 1,15 × 10^18 codes.
2. **Quota par IP sur deux fenêtres** (2/min et 5/h), qui compte les échecs — sinon tâtonner
   serait gratuit.
3. **Refus VOLONTAIREMENT INDISTINCT** sur l'inscription : un seul message et un seul code HTTP
   pour « code inconnu », « déjà utilisée », « expirée », « total faux », « doublon ». Aucune
   valeur d'e-card n'est jamais renvoyée. Il n'existe **aucun** endpoint public de vérification
   d'e-card — `POST /ecards/verify` est réservé aux membres authentifiés, et le rester est
   délibéré. Sur les routes **authentifiées** (renouvellement, checkout), on garde à l'inverse
   les erreurs précises : le tâtonnement y est nominatif et traçable.
4. **`TRUST_PROXY`** doit être renseigné derrière un reverse-proxy, sinon toutes les requêtes
   semblent venir du proxy et se partagent un seul seau — le quota par IP n'existe plus.

Limite assumée : une attaque distribuée contourne un quota par IP. La réponse serait un OTP à
l'inscription, ce qui réviserait D-011/D-021.

## Tests attendus
- Création > solde → refusée.
- Création puis paiement au total exact → e-cards `USED`, solde débité une seule fois.
- Paiement dont le total ≠ montant dû (dessous **comme** dessus) → refusé, rien n'est brûlé.
- Plusieurs cartes cumulées (700 + 1500 = 2200) → acceptées, brûlées par id croissant.
- Même code deux fois dans un paiement → refusé.
- Au-delà du plafond de cartes → refusé.
- Un seul code invalide dans le lot → tout le paiement est annulé.
- Deux paiements concurrents avec la même carte → exactement un réussit.
- Expiration/révocation → valeur (DT) recréditée au créateur, e-card non réutilisable.
