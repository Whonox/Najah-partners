# Najah Partners — Instructions projet (CLAUDE.md racine)

Plateforme MLM à arbre binaire (produits à base d'olive et produits naturels).
Web 100% responsive. Français au lancement, arabe/RTL en phase future. Pas d'app mobile.

## Source de vérité (à lire avant de coder)

- **`docs/spec.md`** fait autorité. En cas de doute, la spec prime sur le code.
- **`docs/decisions.md`** : journal des décisions verrouillées (et de leurs révisions).
- **`docs/plan.md`** : plan de développement en tranches. Coche les cases `[ ]` au fur et à mesure.
- **`.claude/rules/`** : règles de domaine détaillées (moteur de commissions, e-cards, inscription, grand livre — `ledger.md`).
- Une décision métier ne naît **JAMAIS** dans le code. Si une ambiguïté apparaît que la spec ne tranche pas, **arrête-toi et demande** — ne devine pas les règles du jeu.

## Invariants non négociables (ne jamais violer)

- **Deux dimensions qui ne se croisent JAMAIS (D-028).** Les **POINTS** (BV, `Int`) servent uniquement à composer le palier d'un pack et à alimenter les jambes de l'arbre — jamais de valeur monétaire. Les **DINARS** (DT, `Decimal(12,3)`) sont tout l'argent : solde, e-cards, grand livre, commissions, plafonds, prix. **Aucune conversion points↔dinars n'existe nulle part** — toute ligne de code qui en mélangerait est un bug. « L'arbre compte des points, le portefeuille compte des dinars. »
- **Zéro fiat.** Aucune passerelle de paiement. La plateforme génère / valide / brûle des e-cards (libellées en DT) ; l'argent liquide circule hors système.
- **Snapshot à la transaction.** Toute valeur paramétrable (palier en points, prix et commissions/plafonds en DT, valeur BV produit) est figée au moment de la transaction. Ne jamais réécrire l'historique en changeant la config.
- **Placement immuable.** Un membre est placé dans l'arbre dès l'inscription ; sa position ne change plus jamais.
- **E-card usage unique.** Une e-card USED est définitive et irréversible.
- **Baseline à l'activation.** Les commissions d'un membre ne portent que sur les points arrivés APRÈS son activation.

## Architecture

Dépôt git unique contenant 4 projets **indépendants** (ce n'est pas un monorepo outillé : chaque projet a son propre package.json, ses dépendances, son build) :

- `backend/` — NestJS + PostgreSQL. Toute la logique métier (arbre, e-cards, moteur de commissions). **Source de vérité des types** via OpenAPI/Swagger.
- `vitrine/` — Next.js (SSR/SSG, SEO).
- `admin/` — React (Vite) + shadcn/ui. Back-office administrateur.
- `portal/` — React (Vite) + shadcn/ui. Portail affilié.

La logique points/commissions vit **uniquement** dans `backend/`, jamais dupliquée côté front. Les fronts consomment un client TypeScript **généré** depuis l'OpenAPI du backend (pas de types recopiés à la main).

## Conventions de travail

- **Code et nommage en anglais** ; `docs/` et libellés utilisateur en français. Tout le code (variables, colonnes de base de données, enums et leurs valeurs, fonctions, fichiers, modules) est en anglais. Restent en français : le contenu de `docs/` (spec, decisions, plan) et les textes destinés à l'utilisateur final (formulaires, interface).
- Fais des **modifications minimales** — ne refactorise pas du code non demandé.
- Quand tu **hésites entre deux approches**, expose les deux et laisse-moi choisir.
- **Un commit par tranche ou par décision**, message clair et atomique.
- Lance le **typecheck** après chaque changement de code.
- Le **moteur de commissions** et le **grand livre** (`ledger.md`) ne sont « terminés » qu'avec leurs tests (voir `.claude/rules/`).

## Terminologie (glossaire complet : docs/spec.md §4)

Sponsor (parrain → commission directe) ≠ Upline de placement (position dans l'arbre → binaire). Jambe gauche/droite. Pack = palier en points (Silver 1000 / Gold 2000 / Safari 3000 / Diamond 4000) + prix en DT (Silver 2200…, D-029), paramétrables. Équilibre (cycle) = palier atteint sur les deux jambes, constaté au fil de l'eau (D-035). Carry-over = points non appariés, en réserve sans échéance. Bonus de démarrage = UNE commission indirecte, une fois à vie, au passage à 2 membres activés dans l'arbre (D-031 — annule l'ancienne réserve de 6 paliers). Point Fidélité = 3e unité (ni points, ni dinars) : 1 par 6e équilibre à vie (D-032). États adhésion : INSCRIT → ACTIF ⇄ INACTIF (gel, D-034).
