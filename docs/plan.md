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

## Tranche 8b — Back-office : gestion courante (réf. spec §7.2.2 à §7.2.6)
- [x] **Membres (§7.2.2)** : liste (recherche code/nom/e-mail, filtres pack / statut / vérification / période, tri serveur départagé par `id`, pagination) ; fiche en 3 onglets — identité + **numéro ET image de pièce** (D-018/D-039, image masquée par défaut, chargée en binaire authentifié), position dans l'arbre (**sponsor et upline de placement visuellement séparés**), points par jambe / baseline / carry-over, compteurs du moteur (équilibres à vie, bonus, Points Fidélité), mouvements de solde paginés. Lien vers l'ajustement de solde (module T8c), jamais dupliqué.
- [x] **Généalogie (§7.2.3)** : rendu MAISON (pas de bibliothèque de graphe — arbre binaire borné, DOM accessible, thème shadcn), recentrage par code membre (correspondance exacte), descente/remontée par fil d'Ariane. **L'arbre entier n'est jamais chargé** : 2 niveaux par requête, la descente est un RECENTRAGE (nouvelle requête bornée), pas un dépliage cumulatif.
- [x] **Packs (§7.2.4)** : CRUD **sans suppression** (D-043), validations (valeurs > 0, plafond ≥ les DEUX commissions, contrôlé sur les valeurs résultantes), **avertissement de snapshot permanent** en tête d'écran ET dans le formulaire, compteur de membres par pack pour rendre l'invariant tangible.
- [x] **Produits (§7.2.5)** : CRUD produits (stock conditionné au type — le champ disparaît en VIRTUEL) + CRUD catégories (suppression seulement si vide). Rappel à l'écran : la valeur en points compose les paliers, la promo baisse le prix DT sans y toucher.
- [x] **Commandes (§7.2.6)** : liste (filtres membre / contexte / file d'expédition), détail avec snapshots par ligne, avancement PREPARATION → SHIPPED → DELIVERED. **Aucun chemin d'annulation** (point ouvert non tranché : les e-cards sont brûlées, `USED` est irréversible).
- [x] **Transverse** : deux dimensions jamais confondues à l'écran (D-028 — `MoneyDt` 3 décimales aligné à droite, `PointsBv` entier), RBAC cohérent (lecture 3 rôles ; packs SUPER_ADMIN, catalogue et expédition SUPER_ADMIN+MANAGER), clés de cache hiérarchiques (`["admin", module, …]`) invalidées par préfixe, **tous les libellés FR extraits** dans `i18n/fr.ts`, formulaires en react-hook-form + zod (composant `form` porté à la main — absent du registre `base-nova`).
- [x] **Backend, en appui** : `GET /admin/members` + `/{id}` + `/{id}/id-document` (n'existaient pas) ; `hasLeftChild`/`hasRightChild` sur la CTE descendante (sans quoi une feuille tronquée est indistinguable d'une vraie) ; module `packs/` complet (aucun contrôleur ne touchait `Pack`) ; DTO de réponse + `@ApiOkResponse` sur les 13 opérations consommées qui sortaient en `unknown`. OpenAPI réexporté, client TS régénéré.
- [x] Vérifications : `npm run build` + `npm run lint` verts dans `admin/` ; backend typecheck 0, **192 unitaires + 106 intégration verts** ; **53 appels de bout en bout** contre la pile réelle (chaque endpoint des 5 écrans, RBAC d'un compte GESTIONNAIRE → 403 sur les packs et les paramètres, 200 sur le catalogue).
- [ ] **Point ouvert (bloquant, D-043)** : « bloquer / débloquer » un membre — aucun concept en base, **rien inventé**. À trancher avec la cliente (voir `docs/decisions.md`).

## Tranche 8c — Back-office : valeur et supervision (réf. spec §7.2)
- [x] **Tableau de bord (§7.2.1)** : les TÂCHES en tête d'écran (vérifications, renouvellements — deux files de nature opposée, l'écran le dit), puis membres par état, activations du jour et de la **semaine du moteur** (vendredi 23:59 Tunis, pas la semaine civile), répartition des packs, e-cards actives vs consommées, dinars dans le système (soldes + e-cards actives, décomposés), dernier run et **date du prochain** (calculée depuis la MÊME expression cron que le déclencheur), total distribué. Deux graphes **SVG maison** (barres = activations par jour, courbe = croissance cumulée), sans dépendance, doublés d'un tableau lisible par lecteur d'écran. Rappel permanent : les POINTS non appariés sont reportés, l'ARGENT au-delà du plafond est PERDU.
- [x] **Moteur de commissions — supervision (§7.2.7)** : « en attente du prochain run » (dû brut, part inéligible tracée mais jamais payable), historique filtrable, détail d'un run (brut / versé / **perdu au plafond** / événements inéligibles / bénéficiaires sans règlement / journal), et **chronologie par membre** dans l'ordre réel d'application du plafond — cumul avant, payé, perdu, événement « franchit le plafond » payé partiellement, Point Fidélité accordé ou perdu, ligne inéligible signalée. Ventilation par événement **rejouée par `settleWeek`**, la fonction du run elle-même (D-047), et couverte par 5 tests unitaires supplémentaires. **Relance** réservée au SUPER_ADMIN (idempotente, clôture valide exigée) ; **pas de rollback** (point ouvert).
- [x] **Soldes & mouvements (§7.2.8)** : registre des soldes (recherche, filtre d'état, tri, somme des soldes FILTRÉS) et journal global des mouvements (type, montant signé, solde après, source, motif, somme signée). Ajustement manuel (SUPER_ADMIN + MANAGER) et **genèse de valeur** (SUPER_ADMIN seul) avec motif obligatoire — rendu obligatoire aussi **côté serveur**, où la genèse l'acceptait vide. Rappel permanent D-025 : consommer une e-card n'écrit RIEN au grand livre.
- [x] **E-cards (§7.2.9)** : liste (statut / origine / créateur / bénéficiaire / période, recherche par code EXACT), fiche avec traçabilité et ce que la carte a payé, révocation (« la valeur est recréditée au créateur » écrit à l'écran, motif obligatoire), prolongation, genèse. **Aucun code n'est restituable — c'est structurel (D-045)** : le DTO admin n'en porte pas, l'écrire ne compilerait pas ; seule la réponse de genèse le rend une fois.
- [x] **Rapports (§7.2.10)** : ventes produits (DT **et** points, jamais déduits l'un de l'autre), activations par pack (encaissé = prix − acompte, points injectés entiers), commissions par période (une ligne par run, avec le perdu), dinars en circulation décomposés par nature, top affiliés sur les commissions réellement PERÇUES. **Exports CSV écrits côté front** depuis les données affichées (`;` + BOM UTF-8, montants en valeur brute) — pas de route d'export à garder d'accord avec le tableau.
- [x] **Comptes admin & rôles (§7.2.12)** : CRUD (sans suppression — un compte reste référencé par ce qu'il a validé), rôle, activation, réinitialisation de mot de passe **posée par le super-admin** (aucun envoi d'e-mail n'existe — D-011). Garde-fous contre l'auto-verrouillage : on ne se désactive ni ne se dégrade soi-même, le **dernier SUPER_ADMIN actif est intouchable**, et tout changement de rôle / de mot de passe / de statut **RÉVOQUE les sessions** (sinon le jeton déjà émis garde ses droits un quart d'heure). Journal des **sessions** dérivé des jetons de rafraîchissement, avec la mention explicite que les tentatives échouées ne sont enregistrées nulle part. **Aucune matrice de permissions** (point ouvert).
- [x] **File de vérification d'identité (D-018/D-039)**, en attente depuis T4 : l'endpoint d'écriture manquait (la file ne pouvait pas se vider). Écran de traitement image / **numéro saisi** / identité côte à côte, VERIFIED ou REJECTED (motif obligatoire), tracé. **Invariant vérifié à l'écran et par un test : la vérification ne bloque rien** (D-046).
- [x] **File des renouvellements (D-038)** : membre, **état courant** (qui dit ce que la validation va faire), montant figé, ids des e-cards brûlées (jamais les codes), validation avec conséquence annoncée (réactivation + nouvelle baseline, carry-over d'avant le gel conservé — ou simple report d'échéance). **Aucun chemin de refus**, et l'écran explique pourquoi.
- [x] **Transverse** : `ConfirmDialog` thémé à DEUX niveaux (simple, et **renforcé** avec mot à recopier pour ce qui crée de la valeur), qui remplace le `window.confirm` des catégories et couvre l'avancement d'expédition (irréversible) — les confirmations sont désormais calées sur la gravité réelle, dans les deux sens. RBAC cohérent (le front masque, le backend autorise), D-028 tenu à l'écran (`MoneyDt` 3 décimales / `PointsBv` entier), états vides nommés, tous les libellés FR dans `i18n/fr.ts` en **clés dédiées** par module.
- [x] **Backend, en appui** : modules `dashboard/`, `reports/`, `admin-users/` ; supervision et relance dans `commissions/` ; registre + journal dans `ledger/` ; liste/fiche e-card ; écriture de la vérification d'identité (+ migration `20260725100000_t8c_identity_verification` : 3 colonnes, 2 CHECK) ; DTO de réponse sur la file des renouvellements et sur les actions e-card / grand livre qui sortaient en `unknown`. **23 nouvelles routes**, toutes avec schéma de réponse. OpenAPI réexporté, client TS régénéré.
- [x] Vérifications : `npm run build` + `npm run lint` verts dans `admin/` ; backend typecheck 0, **225 unitaires + 106 intégration verts** ; parcours réel au navigateur (12 écrans à **1440 / 1024 / 768 / 390**, clair ET sombre) — aucun débordement de page, **aucun code d'e-card dans le DOM** (balayage par motif `XXX-XXX-XXX-XXX` sur `innerHTML`, seul le placeholder de recherche remonte), console sans erreur (un avertissement Base UI préexistant sur les boutons-liens corrigé au passage). Genèse + révocation d'e-card, ajustement de solde et verdict de vérification exécutés de bout en bout, puis **toutes les traces supprimées de la base** (état initial rétabli et vérifié).

## Tranche 9 — Portail affilié (réf. spec §7.1, portal/CLAUDE.md)
- [x] **Thème** (`portal/src/index.css`) : palette Najah en clair ET sombre, une variable = un rôle commenté, seul fichier à éditer pour changer l'identité. Registre plus chaleureux et plus aéré que l'admin (rayon 0.75rem, or employé pour PORTER la valeur et non seulement la signaler) : jetons propres au portail — `--highlight` (cartes de solde et de gains), `--warning` (échéance, compte gelé), `--leg-left` / `--leg-right` (les deux jambes, **mêmes couleurs sur les trois écrans** qui les montrent). Zéro couleur en dur.
- [x] **Auth membre (D-016)** : connexion par e-mail **ou** téléphone **ou** code membre en UN seul champ (le backend résout lequel des trois — faire choisir à l'affilié serait lui faire porter une distinction technique). Access token **en mémoire seule** (vérifié : `localStorage` ne contient que le thème, `sessionStorage` vide), refresh silencieux au chargement, rejeu d'un 401 après UN rafraîchissement, et **une seule requête `/auth/refresh` pour 5 appels concurrents** (vérifié en direct : 5 → 1, même token — sans quoi la détection de réutilisation D-016b éjecterait l'affilié pour avoir laissé son onglet ouvert). Mot de passe oublié : écran exposé, demande réellement enregistrée, et **il est écrit qu'aucun message ne sera envoyé** (D-011) — rien n'est simulé.
- [x] **Layout MOBILE D'ABORD** : barre d'onglets FIXE en bas sous `lg` (4 écrans + « Plus », cibles ≥ 44 px — c'est cette contrainte qui fixe le nombre d'entrées `primary` dans `lib/nav.ts`), feuille « Plus » pour les écrans secondaires, colonne latérale au-dessus de `lg`. Une seule table de navigation pour les deux dispositions. Contenu borné en largeur : sur 1440 px, des cartes étirées rendraient les phrases illisibles.
- [x] **Tableau de bord (§7.1.1)** : solde en dinars dominant, gains cumulés, dernier versement (brut / versé / **perdu au plafond**), dû en attente + **date du prochain run** (même expression cron que le déclencheur), deux jambes avec cumul à vie ET carry-over, palier, équilibres à vie, Points Fidélité, bonus de démarrage, réseau, e-cards actives. Bandeau d'action **unique** en tête (gelé > renouvellement payé non validé > non activé > échéance proche) : trois bandeaux empilés se lisent comme du décor.
- [x] **Pédagogie** (`components/common/explain.tsx`, clés `explain.*` groupées) : équilibre, report des points, plafond, deux unités, commission directe, bonus, Points Fidélité, **sponsor ≠ upline de placement**, « un achat libre ne rapporte aucun point ». L'explication du plafond n'apparaît que si quelque chose a été perdu — l'afficher à vide apprendrait à ne plus la lire.
- [x] **Mes e-cards (§7.1.3)** : création à montant libre plafonnée au solde, **code révélé UNE seule fois** (avertissement AVANT le code, copie, « valeur au porteur »), liste sans codes, vérification d'un code reçu, prolongation (D-026). Cycle expliqué : créer sort l'argent du solde, expirer/révoquer le rend.
- [x] **Boutique & activation (§7.1.4)** : un AIGUILLAGE sur l'état réel du compte, jamais deux parcours dans un même écran. Activation — pack, panier au palier EXACT en points avec compteur **collant** (« il reste N points »), montant dû = prix − acompte (D-037) affiché avec son détail. Achat libre — somme des prix DT, et **« aucun point, aucun effet sur votre arbre »** dit en tête (D-005). Gelé : ni l'un ni l'autre, avec la raison. Composeur de paiement partagé (activation / achat libre / renouvellement) qui **vérifie chaque code à la saisie** et dit « il manque X » AVANT l'envoi — arithmétique en **millimes entiers** (`lib/money.ts`), jamais en flottant : la couverture exacte (D-030) se joue au millime.
- [x] **Mon réseau (§7.1.5 / §7.1.6)** : arbre maison borné à 2 niveaux, descente par **RECENTRAGE** (nouvelle requête bornée, jamais un dépliage cumulatif) ; liste des downlines filtrable (recherche, état, jambe, filleuls directs) avec points apportés = palier figé à SON activation — `—` et non `0` pour un non-activé. Bloc dédié **sponsor vs upline de placement**.
- [x] **Mes gains** : historique par semaine (brut, versé, perdu au plafond, ventilation directes / équilibres / bonus, Points Fidélité) et chronologie détaillée **dans l'ordre d'application du plafond**, avec « c'est ici que votre plafond a été atteint », Point Fidélité obtenu ou perdu, ligne non versée expliquée. Source unique : `CommissionExplainService`, extrait de la supervision admin et **partagé** — l'affilié et le gestionnaire lisent la même explication du même versement (D-047).
- [x] **Parrainer (§7.1.2)** : code + copie + marche à suivre en 5 étapes. **Aucun écran d'inscription** (publique et anonyme, D-021 — elle appartient à la vitrine, T10) et **aucun lien de parrainage inventé** : il n'existe pas côté backend, l'écran le dit.
- [x] **Mon profil (§7.1.7)** : identité (nom/prénom modifiables), **e-mail et téléphone en lecture seule avec la raison** (D-049), badge de vérification **informatif et non bloquant** (D-018), changement de mot de passe (mot de passe actuel exigé, sessions révoquées → reconnexion), renouvellement en deux temps avec « payer ne dégèle pas » écrit en tête (D-038). Aucune donnée bancaire.
- [x] **Backend, en appui** : **9 endpoints affilié manquants** (`GET/PATCH /members/me`, `/me/dashboard`, `/me/downlines`, `/me/ledger`, `POST /me/password`, `GET /commissions/mine` + `/{runId}`, `GET /packs` — l'affilié ne pouvait pas voir les packs, `/admin/packs` étant réservé aux admins) ; **11 opérations existantes** sortaient en `unknown` (login membre, arbre, renouvellements, e-cards, checkout, commandes) → DTO + `@ApiOkResponse` ; `CommissionExplainService` extrait et partagé ; recentrage d'arbre `rootMemberId` **gardé côté serveur** (403 hors sous-arbre) ; réponse de login **rétrécie** à l'identité (elle rendait la ligne `Member` entière, solde compris) ; montants d'un snapshot d'activation antérieur à D-028 rendus `null` et non `0.000` (« — » à l'écran, au lieu d'annoncer un plafond nul). OpenAPI réexporté, client TS régénéré.
- [x] Vérifications : `npm run build` + `npm run lint` + typecheck verts dans `portal/` ; backend build + typecheck 0, **225 unitaires + 106 intégration verts** ; parcours réel au navigateur (8 écrans à **390 / 768 / 1024 / 1440**, clair ET sombre) — **aucun débordement horizontal**, console **sans erreur ni avertissement**, **5 rafraîchissements concurrents → 1 seule requête**, création d'e-card de bout en bout puis **balayage du DOM par motif `XXX-XXX-XXX-XXX` : aucun code après fermeture ni après rechargement**, réponse HTTP de la liste sans code, garde du recentrage vérifiée (403 sur un ancêtre comme sur une autre branche), `PATCH` d'e-mail/téléphone **rejeté en 400** par le contrat. Toutes les traces supprimées de la base (état initial rétabli et vérifié champ par champ).
- [ ] **Point ouvert (corollaire de D-049)** : aucun endpoint admin ne permet de corriger l'e-mail ou le téléphone d'un membre — signalé, **rien inventé** (voir `docs/decisions.md`).

## Tranche 10 — Site vitrine (réf. spec §7.3)
- [ ] Pages (accueil, produits, galerie, qui-sommes-nous, contact), SEO, footer conformité.

## Transverse (à ne pas oublier)
- [ ] i18n dès le départ (FR ; préparer AR/RTL).
- [ ] Journal d'audit sur les actions sensibles.
- [ ] Sauvegardes PostgreSQL.
