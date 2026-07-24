# admin/ — React (Vite) + shadcn/ui

Back-office administrateur. Voir `../docs/spec.md` §7.2 (12 modules).

## Conventions
- Consomme l'API backend via le client TS généré depuis l'OpenAPI (ne pas recopier les types).
- Les types viennent de l'API, JAMAIS recopiés à la main. Après un changement backend :
  `npm run export:openapi` côté `backend/`, puis `npm run generate:api` ici (régénère
  `src/api/generated/`, non commité — voir `.gitignore` racine). `src/api/client.ts`
  (le seul fichier non généré du dossier) configure l'URL de base
  (`VITE_API_BASE_URL`, voir `.env.example`) et `credentials: 'include'` pour le cookie
  refresh httpOnly (D-016).
- Aucune règle métier côté front : afficher/piloter, le calcul est côté backend.
- i18n dès le départ (FR ; préparer AR/RTL — shadcn init supporte --rtl).
- Composants shadcn/ui, cohérence visuelle avec portal/.
