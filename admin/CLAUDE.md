# admin/ — React (Vite) + shadcn/ui

Back-office administrateur. Voir `../docs/spec.md` §7.2 (12 modules).

## Conventions
- Consomme l'API backend via le client TS généré depuis l'OpenAPI (ne pas recopier les types).
- Aucune règle métier côté front : afficher/piloter, le calcul est côté backend.
- i18n dès le départ (FR ; préparer AR/RTL — shadcn init supporte --rtl).
- Composants shadcn/ui, cohérence visuelle avec portal/.
