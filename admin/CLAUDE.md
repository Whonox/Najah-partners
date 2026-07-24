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

## Direction visuelle

Le back-office est un OUTIL DE TRAVAIL : dense, utilisé des heures, les données priment
sur la décoration. Registre sobre — gris/blanc, la couleur ne sert qu'à signaler.

### Règle absolue : aucune couleur en dur
JAMAIS de `bg-[#8A6D1F]`, `text-yellow-600`, `border-gray-200` dans un composant.
TOUJOURS les variables sémantiques shadcn : `bg-background`, `bg-card`, `text-foreground`,
`text-muted-foreground`, `bg-primary`, `border`, `bg-destructive`.
Raison : la palette n'est pas définitive (le logo a déjà changé). Elle doit pouvoir
être remplacée en éditant UNIQUEMENT src/index.css, sans toucher un seul composant.

### Palette — mode clair
Fond de page      #FAFAF9   background
Cartes/tableaux   #FFFFFF   card, popover
Bordures          #E7E5E4   border, input
Texte principal   #1C1917   foreground
Texte secondaire  #78716C   muted-foreground
Accent            #8A6D1F   primary (texte blanc dessus — contraste ~5,5:1)
Accent liens      #9A8A2E   pour texte doré sur fond clair
Danger / Succès   défauts shadcn

Mode sombre : requis. Fond #0E0E0C (noir Najah), cartes #1C1917, bordures #292524,
texte #FAFAF9, secondaire #A8A29E, accent #C6B23E (l'or clair passe bien sur sombre).

### Fichier de thème
src/index.css contient TOUTES les variables, avec un commentaire au-dessus de chacune
indiquant son rôle. C'est le seul fichier à éditer pour changer l'identité visuelle.

### Densité et composants
- Tableaux compacts, lisibles à 20+ lignes sans scroll horizontal excessif.
- Navigation (sidebar + header) peut porter l'identité ; la zone de travail reste neutre.
- Composants shadcn uniquement, pas de CSS custom sauf nécessité justifiée.
- Montants en dinars : toujours affichés à 3 décimales, alignés à droite.
- Points (BV) : entiers, jamais confondus visuellement avec des dinars.