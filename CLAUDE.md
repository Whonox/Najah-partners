# Najah Partners — Instructions projet (CLAUDE.md racine)

Plateforme MLM à arbre binaire (produits à base d'olive et produits naturels).
Web 100% responsive. Français au lancement, arabe/RTL en phase future. Pas d'app mobile.

## Source de vérité (à lire avant de coder)

- **`docs/spec.md`** fait autorité. En cas de doute, la spec prime sur le code.
- **`docs/decisions.md`** : journal des décisions verrouillées (et de leurs révisions).
- **`docs/plan.md`** : plan de développement en tranches. Coche les cases `[ ]` au fur et à mesure.
- **`.claude/rules/`** : règles de domaine détaillées (moteur de commissions, e-cards, inscription, grand livre BV).
- Une décision métier ne naît **JAMAIS** dans le code. Si une ambiguïté apparaît que la spec ne tranche pas, **arrête-toi et demande** — ne devine pas les règles du jeu.

## Invariants non négociables (ne jamais violer)

- **BV = unité unique.** Tous les montants internes sont en BV (points). Aucune transaction n'est calculée ni stockée en dinars.
- **Zéro fiat.** Aucune passerelle de paiement. La plateforme génère / valide / brûle des e-cards ; l'argent liquide circule hors système.
- **Snapshot à la transaction.** Toute valeur paramétrable (palier, commissions, plafonds, BV produit) est figée au moment de la transaction. Ne jamais réécrire l'historique en changeant la config.
- **Placement immuable.** Un membre est placé dans l'arbre dès l'inscription ; sa position ne change plus jamais.
- **E-card usage unique.** Une e-card USED est définitive et irréversible.
- **Baseline à l'activation.** Les commissions d'un membre ne portent que sur les points arrivés APRÈS son activation.

## Architecture

Dépôt git unique contenant 4 projets **indépendants** (ce n'est pas un monorepo outillé : chaque projet a son propre package.json, ses dépendances, son build) :

- `backend/` — NestJS + PostgreSQL. Toute la logique métier (arbre, e-cards, moteur de commissions). **Source de vérité des types** via OpenAPI/Swagger.
- `vitrine/` — Next.js (SSR/SSG, SEO).
- `admin/` — React (Vite) + shadcn/ui. Back-office administrateur.
- `portal/` — React (Vite) + shadcn/ui. Portail affilié.

La logique BV/commissions vit **uniquement** dans `backend/`, jamais dupliquée côté front. Les fronts consomment un client TypeScript **généré** depuis l'OpenAPI du backend (pas de types recopiés à la main).

## Conventions de travail

- Fais des **modifications minimales** — ne refactorise pas du code non demandé.
- Quand tu **hésites entre deux approches**, expose les deux et laisse-moi choisir.
- **Un commit par tranche ou par décision**, message clair et atomique.
- Lance le **typecheck** après chaque changement de code.
- Le **moteur de commissions** et le **grand livre BV** ne sont « terminés » qu'avec leurs tests (voir `.claude/rules/`).

## Terminologie (glossaire complet : docs/spec.md §4)

Sponsor (parrain → commission directe) ≠ Upline de placement (position dans l'arbre → binaire). Jambe gauche/droite. Pack = palier BV (Silver 1000 / Gold 2000 / Safari 3000 / Diamond 4000, paramétrables). Cycle = équilibre atteint sur les deux jambes. Carry-over = report des points non appariés. Bonus de démarrage = 6 premiers paliers déséquilibrés rémunérés (paramétrable). États adhésion : INSCRIT → ACTIF → INACTIF.
