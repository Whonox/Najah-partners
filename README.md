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

### Installation des dépendances
Chaque projet a son propre `package.json` — il n'y a pas d'installation racine.

```bash
cd backend  && npm install
cd vitrine  && npm install
cd admin    && npm install --legacy-peer-deps
cd portal   && npm install --legacy-peer-deps
```

**`--legacy-peer-deps` est OBLIGATOIRE pour `admin/` et `portal/`**, et le rester est un choix
assumé : ces deux projets utilisent **TypeScript 6**, alors qu'`openapi-typescript@7` déclare
encore `typescript@^5.x` en `peerDependency`. Le conflit est **déclaratif, pas réel** — la
génération du client depuis `backend/openapi.json` fonctionne. Sans le flag, `npm install`
échoue en `ERESOLVE` sur une machine vierge. L'alternative (rétrograder en TypeScript 5) a été
écartée : on ne rétrograde pas un compilateur pour satisfaire la borne d'un générateur de types.
À réévaluer quand `openapi-typescript` élargira son intervalle.

### Base de données locale
`backend/docker-compose.yml` fournit un PostgreSQL 16 sur le port **5433**. Docker n'est pas
obligatoire : n'importe quel PostgreSQL 16 écoutant sur ce port convient (aucune extension
n'est requise). Il suffit de créer le rôle et la base attendus par `backend/.env` :

```sql
CREATE ROLE najah LOGIN PASSWORD 'najah_dev';
CREATE DATABASE najah_partners OWNER najah;
```

Puis, depuis `backend/` : `cp .env.example .env` (et y mettre de vrais secrets JWT),
`npx prisma migrate deploy`, `npx prisma generate`, `npm run db:seed`.

Le seed crée le réseau d'amorçage de **500 comptes** (D-051) en une minute environ :
racine `NP000963`, mot de passe `ChangeMe123!`, admin `admin@najah.local`.
