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
- ORM : **Prisma 6** sur PostgreSQL (décision D-014). L'arbre binaire utilisera des requêtes récursives (CTE) en SQL brut via `$queryRaw`, jamais de logique métier dupliquée côté front.
- Tests obligatoires pour le moteur de commissions et le grand livre BV avant de clore la tranche.
