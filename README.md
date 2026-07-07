# Najah Partners

Plateforme MLM à arbre binaire (produits olive / naturels). Dépôt unique, 4 projets indépendants.

## Structure
- `backend/` — NestJS + PostgreSQL (logique métier, API, source des types via OpenAPI)
- `vitrine/` — Next.js (site public)
- `admin/` — React (Vite) + shadcn/ui (back-office)
- `portal/` — React (Vite) + shadcn/ui (portail affilié)
- `docs/` — spec (source de vérité), journal de décisions, plan
- `.claude/rules/` — règles de domaine pour l'agent

## Règle d'or
La spec (`docs/spec.md`) est la source de vérité unique. Aucune décision métier ne naît dans le code. Voir `CLAUDE.md`.

## Développement
Voir `docs/plan.md` pour l'ordre des tranches. Lancer Claude Code depuis la racine du dépôt.
