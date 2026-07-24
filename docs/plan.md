# Plan de développement — tranches verticales

Ordre par dépendance. Chaque tranche est testable et se termine par un commit. Coche les cases au fur et à mesure. Ne pas démarrer une tranche sans avoir lu la spec et les règles associées.

## Tranche 0 — Fondations
- [ ] Dépôt git initialisé, kit de démarrage en place, premier commit.
- [ ] `backend/` scaffoldé (NestJS), connexion PostgreSQL OK.
- [x] `vitrine/`, `admin/`, `portal/` scaffoldés (Next.js / Vite+React+shadcn).
- [x] Swagger/OpenAPI activé côté backend ; génération du client TS côté fronts vérifiée sur un endpoint bidon.

## Tranche 1 — Modèle de données (réf. spec §8)
- [x] Schéma PostgreSQL : Affilie, Pack, NoeudArbre, GrandLivreBV, Ecard, Commission, RunCommission, Produit, Commande, AdminUser, Parametre, JournalAudit.
- [x] Choix ORM tranché (Prisma ou TypeORM) — noter dans backend/CLAUDE.md.
- [x] Migrations + seed minimal (packs par défaut, 1 admin).

## Tranche 2 — Authentification (réf. D-011)
- [x] Connexion email / téléphone / code membre + mot de passe, récupération de mot de passe.
- [x] RBAC admin (super-admin / gestionnaire / support).
- [x] Tests auth.

## Tranche 3 — Grand livre BV (réf. rules/bv-ledger.md)
- [x] Service de mouvements BV atomiques, solde jamais négatif.
- [x] Ajustement admin tracé.
- [x] **Tests d'invariants** (voir la règle).

## Tranche 4 — Inscription, placement, cycle de vie (réf. rules/inscription-placement.md, rules/tree.md)
- [x] Formulaire d'inscription (sponsor + upline + jambe), code auto-incrémenté, état INSCRIT, placement définitif.
- [x] Transition INSCRIT → ACTIF (activation structurelle : snapshot du pack, débit BV, propagation du palier à tous les ancêtres).
- [x] Baseline figée à l'activation.
- [x] Verrou de concurrence sur une position (contrainte DB `@@unique([uplineId, leg])`) + ordre de verrouillage d'arbre (D-024).
- [x] Consultation de l'arbre (CTE récursive descendante, une requête).
- [x] Vérification d'identité : champs + upload local, non bloquante (D-018).
- [x] Seed du réseau d'amorçage : 7 comptes ACTIFS sur 3 niveaux (D-019).
- [x] Tests placement + baseline (16 tests d'intégration + unitaires).
- [ ] **Reporté** : transition ACTIF → INACTIF (renouvellement annuel validé par l'admin, §5.9). Le montant `annual_renewal_bv` est encore « à confirmer avec la cliente » : l'implémenter reviendrait à inventer une règle. À traiter avec le back-office (Tranche 8).
- [ ] **Reporté** : tests de charge de l'arbre (D-014).

## Tranche 5 — E-cards (réf. rules/ecard.md)
- [x] Création plafonnée, format, états, expiration paramétrable (cron quotidien), remboursement créateur.
- [x] Consommation atomique (activation par e-card, `ActivationPayment` — D-025) + rate-limiting sur la vérification.
- [x] Génération admin (amorçage/promo, SUPER_ADMIN) + révocation + prolongation (D-026).
- [x] Tests e-card (unit + int : rollback, concurrence, conservation de la masse BV).

## Tranche 6 — Boutique & activation (réf. spec §5.6, §5.7)
- [x] Produits (prix DT + valeur BV, type physique/virtuel, stock, livraison, promo).
- [x] Panier + checkout activation (palier exact, paiement e-card).
- [x] Achat libre (sans effet arbre).
- [x] Commandes + statuts d'expédition.

## Tranche 6.5 — Refactor d'unité monétaire (réf. D-028, D-029)
- [x] Modèle à deux dimensions : POINTS (`Int`) pour palier + arbre ; DINARS (`Decimal(12,3)`) pour tout l'argent. Aucune conversion.
- [x] Schéma + migration en place (rename/cast, `BvLedgerEntry→LedgerEntry`, `…Bv→…Dt` monétaires), `src/common/money.ts`.
- [x] Services : grand livre, e-cards (valeur DT), checkout (`dueDt` = prix du pack en activation, Σ prix DT en libre), activation (paie le prix, propage le palier en points), endpoints admin.
- [x] Seed recalé sur la table cliente (paliers points / prix + plan de rémunération DT).
- [x] Vérifié : aucune conversion points↔dinars dans le code.
- [x] Docs (spec §5.1/§6, decisions D-028/D-029 + révision D-002 + point ouvert e-card, rules, CLAUDE.md) ; tests des 2 suites adaptés (build OK, typecheck 0, migrate status propre, 126 unit + 63 int verts).

## Tranche 7 — Moteur de commissions (réf. rules/commission-engine.md) — LE joyau
- [x] Temps 1 (D-035) : événements écrits au fil de l'eau à l'activation — équilibres (consommation immédiate, carry-over en réserve), bonus de démarrage (D-031, annule D-012), Points Fidélité du 6e équilibre (D-032), éligibilité à l'instant (D-034), snapshot.
- [x] Temps 2 : cron hebdo (vendredi 23:59 Tunis), plafond chronologique (D-033, paiement partiel au franchissement), crédit grand livre + Points Fidélité, run journalisé (supervision UI en T8), idempotence par réclamation.
- [x] Gel / réactivation — partie moteur (D-034) : `RenewalService`, nouvelle baseline, carry-over conservé (circuit admin 100 DT en T8).
- [x] **Tests de scénarios déterministes** (voir la règle) — bloquant. (149 unit + 76 int verts.)

## Tranche 7.5 — Frais d'inscription par e-card & acompte (réf. D-036 à D-041)
- [x] Inscription payée par e-card(s) (D-036) : total exact, consommation ATOMIQUE dans la transaction de création du membre INSCRIT — un échec laisse les cartes `ACTIVE` et ne crée rien. Montant figé sur le membre (`registrationPaidDt`).
- [x] Activation : montant dû = prix du pack − acompte (D-037, Silver 2100 DT). Panier TOUJOURS au palier exact en points, arbre crédité du palier entier — le moteur de commissions n'a pas bougé.
- [x] Renouvellement annuel en deux temps (D-038) : paiement par e-card(s) → `PENDING_VALIDATION` (le gelé reste gelé), validation admin → réactivation D-034 (nouvelle baseline, carry-over d'avant conservé). Service + endpoints minimaux ; écran admin en T8.
- [x] Numéro de pièce d'identité (D-039), non bloquant comme le reste de la vérification.
- [x] Cumul de plusieurs e-cards (D-030) généralisé : inscription, renouvellement, activation ET achat libre (D-041 — lien porté par `Ecard.orderId`, invariant `Order.ecardCount`). Plafond de sécurité de 10 cartes par paiement (D-040).
- [x] Durcissement de l'endpoint public d'inscription : quota par IP sur deux fenêtres, plafond de codes par requête, refus indistinct (anti-oracle), `TRUST_PROXY`, aucun code en clair dans les logs ou l'audit.
- [x] Seed recalé (`registration_fee_dt` = 100, `annual_renewal_dt` = 100, comptes d'amorçage inscrits par e-card de genèse) ; toute trace de « 100 DT en espèces hors système » purgée du code et des docs.
- [x] Docs (spec §5.3/§5.4/§5.9, decisions D-036→D-041, rules inscription/ecard/tree/shop/moteur) ; build OK, typecheck 0, migrate status propre, **157 unit + 86 int verts**.
- [ ] **Point ouvert** : que devient la valeur si l'admin REFUSE un renouvellement (e-cards déjà brûlées) ? Aucun chemin de refus tant que la cliente n'a pas tranché.

## Tranche 8a — Back-office : fondations (réf. spec §7.2, admin/CLAUDE.md)
- [x] **Thème** (`admin/src/index.css`) : palette Najah en clair ET sombre, une variable = un rôle commenté, seul fichier à éditer pour changer l'identité. Sélecteur clair / sombre / système persisté, `system` suivi en direct. Zéro couleur en dur (y compris le voile du panneau latéral, passé en variable `--overlay`).
- [x] **Auth admin (D-016)** : écran de connexion, access token **en mémoire seule** (vérifié : `localStorage` et `sessionStorage` vides), refresh silencieux au chargement, rejeu automatique d'un 401 après UN rafraîchissement, **une seule requête `/auth/refresh` pour N appels concurrents** (vérifié : 5 → 1, même token — sans quoi la détection de réutilisation D-016b révoquerait la famille de jetons), déconnexion qui purge la mémoire et vide le cache.
- [x] **Layout & navigation** : sidebar (identité) + header (nom, e-mail, rôle, thème, déconnexion), zone de travail neutre, les **12 modules** de §7.2 déclarés une seule fois (`src/lib/nav.ts`), pages « À venir » pour les 11 non construits, sidebar repliée en panneau coulissant sous `lg`.
- [x] **Routing protégé + RBAC (D-017b)** : `ProtectedRoute` (attend la fin du refresh silencieux avant de rediriger) et `RoleRoute` réutilisable, appliqué aux routes ET au menu. Vérifié avec un compte GESTIONNAIRE : « Comptes admin » masqué, URL forcée → « Accès refusé », et mutation forcée → **403 du backend** (le front masque, le backend autorise).
- [x] **Écran « Paramètres système » (§7.2.11)** de bout en bout : liste + édition de valeur, invalidation après succès, toast, lecture seule hors SUPER_ADMIN (**D-042**).
- [x] **Transverses** : `DataState` (chargement / erreur + réessai / vide), formatage **DT à 3 décimales par découpage de chaîne** (jamais de flottant) et **points entiers** visuellement distincts (D-028), i18n structurée (dictionnaire FR à clés typées, `dir` posé pour l'AR/RTL — rien de traduit).
- [x] **Backend, en appui** : DTO de réponse + `@ApiOkResponse` sur `/auth/admin/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` (ils sortaient sans schéma → `unknown` côté client généré) ; nouveau `GET /auth/admin/me` (nom, e-mail, rôle — l'en-tête ne peut pas les tirer du JWT) ; **module `settings/`** (liste + modification tracée dans `AuditLog`, RBAC D-042). OpenAPI réexporté, client TS régénéré.
- [x] Vérifications : `npm run build` + `npm run lint` verts dans `admin/` ; backend build + typecheck 0 + **162 unit + 86 int verts** ; parcours réel piloté au navigateur (connexion → paramètres → modification → thème → rechargement → responsive → déconnexion), aucune erreur console.

## Tranche 8b/8c — Back-office : les 12 modules (réf. spec §7.2)
- [ ] Dashboard, membres, généalogie, packs, produits, commandes.
- [ ] Moteur de commissions (supervision), soldes & mouvements, e-cards, rapports, comptes admin.
- [ ] File d'attente des renouvellements à valider (D-038) et badge de vérification d'identité (D-018/D-039), reportés de T4/T7.5.

## Tranche 9 — Portail affilié (réf. spec §7.1)
- [ ] Dashboard, e-cards, achat/activation, arbre, downlines, profil.

## Tranche 10 — Site vitrine (réf. spec §7.3)
- [ ] Pages (accueil, produits, galerie, qui-sommes-nous, contact), SEO, footer conformité.

## Transverse (à ne pas oublier)
- [ ] i18n dès le départ (FR ; préparer AR/RTL).
- [ ] Journal d'audit sur les actions sensibles.
- [ ] Sauvegardes PostgreSQL.
