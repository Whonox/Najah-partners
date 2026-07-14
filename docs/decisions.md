# Journal des décisions (ADR léger)

Chaque décision métier verrouillée est consignée ici. Format : identifiant, date, décision, raison. Une décision n'est « réelle » qu'une fois écrite ici et commitée. Une décision qui en annule une autre le dit explicitement.

| ID | Décision | Raison / source |
|---|---|---|
| D-001 | BV est l'unité interne unique ; la plateforme ne manipule jamais de fiat. | Modèle e-card only ; réduit l'exposition paiement. |
| D-002 | Prix en DT = affichage uniquement ; seul le BV est transactionnel. | Cliente. |
| D-003 | Deux liens distincts : sponsor (commission directe) et upline de placement (binaire). | Modèle QNet ; captures cliente. |
| D-004 | Placement explicite (upline + jambe G/D), aucun spillover. | Cliente. |
| D-005 | Seule l'activation injecte du BV dans l'arbre ; les achats de produits n'alimentent pas l'arbre. | Cliente (correction explicite). |
| D-006 | Composition du pack = somme des BV des produits **exactement** égale au palier. | Cliente. |
| D-007 | E-card : format `XXX-XXX-XXX-XXX`, usage unique, transférable, plafonnée au solde, valeur = BV exact. | Cliente. |
| D-008 | Expiration e-card paramétrable en jours ; `-1` = illimité ; remboursement au créateur sur expiration/révocation. | Cliente + précédent QNet (180 j). |
| D-009 | Commissions : cron hebdo, reset vendredi 23:59 (Tunis). Carry-over des points non appariés ; commission au-delà du plafond perdue ; directe comptée dans le plafond. | Cliente. |
| D-010 | Renouvellement annuel 100 DT, validé par l'admin ; sinon INACTIF. Inscription initiale : activation automatique sans admin. | Cliente. |
| D-011 | Auth par email/téléphone/code membre + mot de passe. Pas de KYC. Notifications in-app uniquement. FR au lancement, AR/RTL en phase future. Pas d'app mobile. | Cliente. |
| D-012 | Bonus de démarrage : réserve à vie de 6 paliers déséquilibrés rémunérés (paramétrable), points consommés, compté dans le plafond, démarre à l'activation. | Cliente. |
| D-013 | **Remplace l'ancien modèle de réservation/expiration.** Un inscrit non finalisé (état INSCRIT) persiste indéfiniment, place définitive dès l'inscription, peut recevoir des downlines. Baseline figée à l'activation (seuls les points postérieurs comptent). Suppression de l'état EXPIRÉ, du délai de 7 j et du cron de libération. | Cliente (annule la décision antérieure de réservation temporaire). |
| D-014 | ORM = Prisma (sur PostgreSQL). SQL brut pour la traversée d'arbre (CTE récursives). Performance : arbre en requête récursive indexée, commissions en batch hebdo asynchrone, tests de charge en tranches 4 et 7. | Choix dev : typage fort, migrations fiables, schéma lisible comme source de vérité. |
| D-015 | Le code et le nommage (variables, colonnes DB, enums, fonctions, fichiers) sont en ANGLAIS. Le contenu métier destiné à l'utilisateur (spec, docs, libellés d'interface FR) reste en français. | Convention dev, cohérence et lisibilité du code. |
| D-016 | Authentification par JWT. Deux flux séparés : Member (affilié) et AdminUser, le token porte le type d'acteur. Affilié : connexion par email / téléphone / code membre + mot de passe. Access token court (~15 min) en mémoire côté front + refresh token long (~7 j) en cookie httpOnly. RBAC admin (SUPER_ADMIN / GESTIONNAIRE / SUPPORT). | Backend stateless servant des SPA ; sécurité renforcée pour une plateforme manipulant de la valeur (BV). |
| D-016b | Auth : refresh token opaque haché en base, rotation + reuse detection par familyId. Reset mdp : membres uniquement, token usage unique/expirant. Cookie dev = SameSite=lax/Secure=false ; prod cross-site = SameSite=None + Secure (HTTPS). | Détail d'implémentation Tranche 2. |
| D-017 | Grand livre BV : toute opération de solde (crédit/débit) s'exécute dans une transaction DB avec verrouillage de la ligne du membre (SELECT ... FOR UPDATE), pour garantir l'invariant « solde jamais négatif » sous concurrence. Mouvements en montant signé + balanceAfter stocké. Le solde du membre est la seule source de vérité, le grand livre en est le journal auditable. | Fondation financière ; sécurité des soldes. |
| D-017b | RBAC des endpoints BV : génération (genesis, création de valeur ex nihilo) = SUPER_ADMIN uniquement ; ajustement manuel = SUPER_ADMIN + MANAGER (motif obligatoire, tracé AuditLog) ; consultation solde/historique = les 3 rôles. Tests séparés : `npm test` (unitaire, sans DB) vs `npm run test:int` (Postgres docker, dont le test de concurrence). | Sécurité : l'action la plus sensible (créer du BV) est la plus restreinte. |

## Points encore ouverts (à confirmer avec la cliente)
- Unité du plan de commissions : les montants (500, 250, plafonds…) sont repris en BV ; confirmer si un taux BV↔DT différent s'applique.
- Validation juridique du montage (exposition « schéma pyramidal »).
- Cadrage financier réévalué (périmètre élargi).
