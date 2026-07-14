# backend/ — NestJS + PostgreSQL

Cœur métier de Najah Partners. Voir la spec racine (`../docs/spec.md`) et `../.claude/rules/`.

## Rôle
- Toute la logique MLM : arbre binaire, grand livre BV, e-cards, moteur de commissions, inscription/activation.
- **Source de vérité des types** : exposer OpenAPI/Swagger ; les fronts génèrent leur client depuis ce schéma.
- Cron hebdo (commissions, vendredi 23:59 Tunis).

## Conventions
- TypeScript strict. Architecture modulaire NestJS (un module par domaine).
- Toute opération sur un solde BV est atomique (transaction).
- Snapshot des paramètres à chaque transaction (jamais lire la config live pour l'historique).
- **Code et nommage en anglais** (colonnes DB, enums, fonctions, fichiers) ; libellés utilisateur en français. Voir CLAUDE.md racine.
- ORM : **Prisma 6** sur PostgreSQL (décision D-014). L'arbre binaire utilise des requêtes récursives (CTE) en SQL brut via `$queryRaw`, jamais de logique métier dupliquée côté front.
- Tests obligatoires pour le moteur de commissions et le grand livre BV avant de clore la tranche.

## Pièges à connaître (appris à la dure)

- **Verrouillage** : verrouiller les lignes `Member` par `id` CROISSANT, en une seule instruction, avec `FOR NO KEY UPDATE` — jamais `FOR UPDATE` (il bloque tout INSERT référençant le membre : login, e-card, inscription d'un filleul). En joignant une CTE, joindre la table de base et cibler `FOR NO KEY UPDATE OF m` (on verrouille la table de base, pas les lignes matérialisées de la CTE). Voir `.claude/rules/tree.md` (D-024).
- **Solde BV** : passer par `BvLedgerService.recordMovementInTx`. Ne jamais écrire `Member.bvBalance` directement.
- **Snapshot** : l'activation fige les paramètres du pack (`activationTierBv`, `activationSnapshot`). Le moteur de commissions lit ces colonnes, jamais `Pack` en direct.
- **Raw SQL** : `nextval`/`setval`/`count(*)` renvoient un `bigint` → `BigInt` côté Node, qui casse la sérialisation JSON bien plus loin. Caster en `::int` ou formater en SQL.
- **Tests** : `npm test` = unitaire (Prisma mocké, sans base) ; `npm run test:int` = intégration (vrai Postgres sur le port 5433, fichiers `*.int-spec.ts`).
