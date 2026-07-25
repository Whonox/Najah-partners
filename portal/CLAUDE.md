# portal/ — React (Vite) + shadcn/ui

Portail affilié. Voir `../docs/spec.md` §7.1.

## Conventions
- **`npm install --legacy-peer-deps`** — le flag n'est pas optionnel ici. Ce projet est en
  TypeScript 6 ; `openapi-typescript@7` déclare `typescript@^5.x` en peer. Le conflit est
  déclaratif (la génération du client fonctionne), mais sans le flag l'installation échoue en
  `ERESOLVE` sur une machine vierge. Voir le README racine.
- Consomme l'API backend via le client TS généré depuis l'OpenAPI.
- Les types viennent de l'API, JAMAIS recopiés à la main. Après un changement backend :
  `npm run export:openapi` côté `backend/`, puis `npm run generate:api` ici (régénère
  `src/api/generated/`, non commité — voir `.gitignore` racine). `src/api/client.ts`
  (le seul fichier non généré du dossier) configure l'URL de base
  (`VITE_API_BASE_URL`, voir `.env.example`) et `credentials: 'include'` pour le cookie
  refresh httpOnly (D-016).
- Aucune règle métier côté front.
- Écrans : dashboard, e-cards (créer/lister/vérifier), achat & activation, arbre, downlines, profil.
- i18n dès le départ (FR ; préparer AR/RTL).

## Direction visuelle

Le portail affilié est un ESPACE PERSONNEL : l'affilié y vient consulter ses gains,
son réseau, sa progression. Registre plus chaleureux et plus aéré que le back-office —
c'est un lieu de motivation, pas un outil de saisie.

### Règle absolue : aucune couleur en dur
JAMAIS de `bg-[#8A6D1F]`, `text-yellow-600`, `border-gray-200` dans un composant.
TOUJOURS les variables sémantiques shadcn : `bg-background`, `bg-card`, `text-foreground`,
`text-muted-foreground`, `bg-primary`, `border`, `bg-destructive`.
Raison : la palette n'est pas définitive (le logo a déjà changé). Elle doit pouvoir
être remplacée en éditant UNIQUEMENT src/index.css, sans toucher un seul composant.

### Palette — mode clair
Fond de page      #FAFAF9   background
Cartes            #FFFFFF   card, popover
Bordures          #E7E5E4   border, input
Texte principal   #1C1917   foreground
Texte secondaire  #78716C   muted-foreground
Accent            #8A6D1F   primary (texte blanc dessus)
Accent liens      #9A8A2E   texte doré sur fond clair
Danger / Succès   défauts shadcn

Mode sombre : requis. Fond #0E0E0C, cartes #1C1917, bordures #292524, texte #FAFAF9,
secondaire #A8A29E, accent #C6B23E.

Même palette que l'admin (cohérence de marque), mais usage plus généreux de l'accent :
chiffres clés, cartes de gains, éléments de progression.

### Densité et composants
- Plus d'espacement que l'admin : cartes larges, chiffres mis en valeur.
- Le solde et les gains sont les éléments les plus visibles du tableau de bord.
- Composants shadcn uniquement, pas de CSS custom sauf nécessité justifiée.
- Montants en dinars : 3 décimales, alignés à droite.
- Points (BV) : entiers, jamais confondus visuellement avec des dinars.