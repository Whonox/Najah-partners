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

## Le chrome, depuis la Tranche 9.6 (D-067)

La navigation est HORIZONTALE. Il n'y a plus de colonne latérale, et plus d'en-tête
d'application : `TopBar` (pilule flottante à partir de `lg`, en-tête simple en dessous) et
`AccountMenu` portent tout le chrome. Trois choses à savoir avant d'y toucher :

- **La barre est `sticky`, jamais `fixed`.** Elle reste dans le flux, donc aucun écran n'a de
  marge haute à compenser. Passer à `fixed` obligerait chaque écran à connaître la hauteur du
  chrome — et le premier qui l'oublierait cacherait son titre.
- **La répartition des écrans vit dans `lib/nav.ts`, pas dans un composant.** Ajouter un écran,
  c'est ajouter une ligne avec sa `place` (`bar` / `account` / `cta`). Une entrée oubliée de
  toutes les surfaces reste une route qui marche, dont aucun lien ne parle : `nav.test.ts` le
  refuse. La barre tient CINQ liens — c'est une contrainte de largeur mesurée à 1024 px, pas
  une préférence.
- **L'identité du membre ne s'écrit qu'à un seul endroit du chrome : le menu compte.** L'accueil
  garde son en-tête personnel (`MemberHeader`) ; c'est l'unique duplication tolérée, et elle est
  volontaire. Y remettre le nom ou le code dans la barre recréerait exactement le défaut que
  cette tranche corrige.

## Ce que la Tranche 9.5 a établi (à lire avant de toucher un écran)

### Le registre est porté par `Surface`, pas par des classes recopiées
`components/common/surface.tsx` est le SEUL endroit où se décide à quoi ressemble un bloc.
La règle du filet est une question d’**adjacence**, pas de goût (D-066) :

- `panel` — bloc seul sur sa ligne : **pas** de filet. Le contraste `background`/`card` suffit,
  et un filet ramènerait le registre « formulaire administratif » que cette tranche corrige.
- `card` — bloc dans une grille ou une liste, collé à ses voisins : **filet**. Sans limite,
  trois cartes côte à côte se lisent comme une seule zone.
- `highlight` — la surface dorée, réservée aux chiffres qui portent l’identité (solde, gains,
  code de parrainage). Rare par construction : tout mettre en avant n’avance rien.

Le registre avait déjà divergé en deux phases (accueil sans filet, boutique avec) sans que
personne le décide. Une apparence répétée à la main est une apparence qui dérive.

### Ce qui est tenu par le SERVEUR, jamais par l’écran
- **Parcours d’accueil** (D-050/D-057) : `OnboardingGuard`, défaut **FERMÉ**. Une route
  nouvelle est protégée par omission.
- **Seconde authentification** (D-051/D-058) : `StepUpGuard`, opt-in par `@RequireStepUp()`.
  Le transport (`api/client.ts`) rejoue tout seul après le 403 — **aucun écran ne câble quoi
  que ce soit**. Le compteur d’essais est COMMUN aux deux voies et vit côté serveur.
- **Accueil sans argent** (D-053) : porté par le CONTRAT. `MemberNetworkDto` ne déclare aucun
  champ `…Dt` — afficher un montant depuis cet écran ne compilerait pas. Ne pas « enrichir »
  ce DTO : c’est lui, l’invariant.

### Deux règles d’écran qui ne se devinent pas
- **Aucune vérification d’e-card sur l’inscription** (D-052). `EcardCodesInput` est écrit MUET
  exprès et porte l’avertissement en tête. Y ajouter un retour immédiat ferait de ce
  formulaire public un oracle sur de la valeur au porteur. Les codes MEMBRES, eux, sont
  vérifiés de façon **indistincte** (D-061) — un code membre est une adresse dans l’arbre, un
  code d’e-card *est* de l’argent.
- **La boutique fige son parcours au montage** (D-063). Le relire à chaque rendu faisait
  disparaître la confirmation d’activation à la seconde où elle devait s’afficher.

### Points et dinars, à l’écran
`MoneyDt` (3 décimales, virgule française) et `PointsBv` (entier) ne se ressemblent jamais —
c’est testé. Tout montant interpolé dans une phrase passe par `formatDt`, tout nombre de
points par `formatPoints` : « il manque 130.000 DT » avec un point décimal se lit « cent
trente mille » en français, juste sous un « 130,000 DT » correct.
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