# admin/ — React (Vite) + shadcn/ui

Back-office administrateur. Voir `../docs/spec.md` §7.2 (12 modules).

## Conventions
- **`npm install --legacy-peer-deps`** — le flag n'est pas optionnel ici. Ce projet est en
  TypeScript 6 ; `openapi-typescript@7` déclare `typescript@^5.x` en peer. Le conflit est
  déclaratif (la génération du client fonctionne), mais sans le flag l'installation échoue en
  `ERESOLVE` sur une machine vierge. Voir le README racine.
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

### Le typecheck qui fait foi est `npm run build`, PAS `npx tsc --noEmit`

Les deux ne lisent **pas la même configuration**. `npm run build` lance `tsc -b`, qui suit les
**références de projets** de `tsconfig.json` (`tsconfig.app.json` + `tsconfig.node.json`) et
applique donc les options strictes du code applicatif. `npx tsc --noEmit` sans argument lit le
`tsconfig.json` racine, qui ne contient que des références et aucun fichier : il **ne vérifie
presque rien** et rend un succès trompeur.

Constaté en Tranche 9.5 : une prop obligatoire manquante et un import inutilisé passaient
`tsc --noEmit` et n'étaient rattrapés qu'au build. Après toute modification de ce projet, la
commande à lancer est `npm run build` (ou `npx tsc -b`), jamais `tsc --noEmit` seul.

### Tests — `npm test` (Vitest)

Périmètre **volontairement étroit** : les fonctions PURES, et rien d'autre. Pas de rendu de
composant, pas de DOM simulé, pas de requête interceptée. Ce n'est pas une limite d'ambition
mais un choix de rendement — la logique métier vit dans `backend/`, les parcours se vérifient
au navigateur. Ce qui reste ici est ce qu'aucun des deux ne couvre : une fonction qui se trompe
**silencieusement**, sans planter ni s'afficher de travers.

Conséquence : pas de `globals`, `environment: 'node'`, aucune dépendance de test au-delà de
Vitest. Le jour où un composant devra être testé, il faudra jsdom **et**
`@testing-library/react` — décision à prendre à ce moment-là, pas d'avance.

Les fichiers `*.test.ts` vivent **à côté** du module testé et sont couverts par `tsc -b` comme
par ESLint : un test qui ne compile pas casse le build.

**Piège des caractères invisibles.** Le formatage français utilise l'espace fine insécable
(U+202F) et l'export CSV un BOM (U+FEFF). Dans un test, on les écrit **en échappement**
(`"\u202f"`), jamais collés tels quels : à l'œil, ils sont indiscernables d'une espace
ordinaire, et une assertion qui vise le mauvais des deux passe sans rien vérifier — ou échoue
sans qu'on comprenne pourquoi. Les deux cas se sont produits en Tranche 9.5, et ESLint
(`no-irregular-whitespace`) n'en attrape qu'une partie.

## Photos produit (Tranche 9.5 — D-054, D-059, D-062, D-065)

`pages/products/product-images-dialog.tsx` — dépôt, ordre, retrait.

- **On ne manipule que des POSITIONS.** Le contrat ne rend plus les chemins de stockage mais
  `imageCount` : une photo se demande, se retire et se réordonne par son index. Il n’existe
  aucun chemin de fichier à manipuler côté client — c’est ce qui rend impossible, et non
  seulement improbable, de fabriquer une URL de travers.
- **Le réordonnancement envoie une permutation d’ENTIERS** de 0…n-1. Le backend refuse tout
  ce qui n’en est pas exactement une : une liste plus courte effacerait des images en
  silence, un doublon en dupliquerait une et en perdrait une autre.
- **Deux mécanismes de fraîcheur, et ils ne se remplacent pas.** Le serveur sert un ETag avec
  revalidation (une URL qui désigne une position ne peut pas être `immutable` : le
  réordonnancement change le contenu sans changer l’URL). Le compteur `revision` local, lui,
  force le rafraîchissement de CET écran après une modification — sinon l’élément `<img>`
  n’est pas remonté et le navigateur réaffiche l’image déjà décodée, sans même émettre la
  requête conditionnelle.
- Le contrôle de type qui compte lit les **OCTETS** du fichier, côté serveur. L’attribut
  `accept` et la limite de taille ne sont que du confort.
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

Mode sombre : requis. Fond #0E0E0C (noir Najah), cartes #1C1917, bordures #6E675F,
texte #FAFAF9, secondaire #A8A29E, accent #C6B23E (l'or clair passe bien sur sombre).

### Contraste des bordures (D-044)
Une bordure n'est pas de la décoration : elle délimite une carte, sépare deux lignes d'un
tableau de montants. C'est un élément d'interface STRUCTURANT, donc soumis au seuil de
**3:1** (WCAG 1.4.11) — pas au confort visuel. La valeur sombre est mesurée contre les DEUX
surfaces qu'elle rencontre : #6E675F donne **3,47:1** sur le fond de page et **3,14:1** sur
une carte. L'ancienne valeur (#292524) tombait à 1,27:1 : les cartes et les filets de
tableau disparaissaient. Toute nouvelle valeur se vérifie contre le fond ET la carte.

### Fichier de thème
src/index.css contient TOUTES les variables, avec un commentaire au-dessus de chacune
indiquant son rôle. C'est le seul fichier à éditer pour changer l'identité visuelle.

### Densité et composants
- Tableaux compacts, lisibles à 20+ lignes sans scroll horizontal excessif.
- Navigation (sidebar + header) peut porter l'identité ; la zone de travail reste neutre.
- Composants shadcn uniquement, pas de CSS custom sauf nécessité justifiée.
- Montants en dinars : toujours affichés à 3 décimales, alignés à droite.
- Points (BV) : entiers, jamais confondus visuellement avec des dinars.