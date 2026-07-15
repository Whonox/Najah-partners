**WHONOX**

Software & Solutions numériques

**Spécification Technique & Fonctionnelle**

*Source of Truth*

Plateforme MLM — Najah Partners

Réseau binaire de vente directe — produits à base d'olive et produits
naturels

À l'attention de Mme. Najah

*Document de référence destiné au développement (agent IA / équipe
technique)*

Whonox — Rue Jean-Jacques Rousseau, Imm. Babel, Bloc C, 1er étage

Tél : +216 58 64 63 10 · www.whonox.com

**Table des matières**

**1. But du document**

Ce document constitue la spécification de référence (source of truth) de
la plateforme MLM Najah Partners. Il est destiné à donner à une équipe
de développement — ou à un agent IA de codage — une vision complète et
non ambiguë du projet : concepts métier, règles de gestion, modèle de
données, fonctionnement du moteur de commissions, écrans, stack
technique et contraintes.

Najah Partners est une plateforme web de vente directe en réseau
(network marketing) à structure binaire, centrée sur des produits à base
d'olive et des produits naturels. La plateforme lance en français ; le
support de l'arabe (avec interface de droite à gauche, RTL) est prévu
pour une phase ultérieure. Il n'y a pas d'application mobile : la
plateforme est une application web 100 % responsive.

|                                                                                                                                                                                                                                                                                                             |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Principe directeur —** La plateforme ne manipule jamais de monnaie réelle (fiat). L'unité de valeur interne unique est le BV (Business Volume). L'argent liquide circule exclusivement hors plateforme, de gré à gré entre membres, via l'instrument e-card. Toute conception doit respecter ce principe. |

**2. Description de l'entreprise**

Whonox Software est une entreprise spécialisée dans le développement de
logiciels et la création de solutions numériques sur mesure. Elle
propose des services de création de sites web, de développement
d'applications et de conseil en technologies de l'information, avec un
engagement envers l'excellence, la qualité et la satisfaction client.

**3. Description du projet**

Najah Partners est une plateforme de gestion de réseau MLM permettant de
superviser, coordonner et animer un réseau d'affiliés organisé en arbre
binaire. Elle s'adresse à deux populations : les affiliés (membres
actifs du réseau) et les administrateurs (gestion et suivi des
opérations).

Les affiliés disposent d'un portail personnel pour gérer leur activité,
visualiser leur position et leurs downlines dans l'arbre, suivre leurs
commissions et gérer leurs e-cards. Les administrateurs disposent d'un
back-office complet pour piloter les packs, les produits, les membres,
les e-cards, le moteur de commissions et les paramètres du système.

La solution se compose de trois interfaces : un site vitrine public
(marketing et découverte des produits), un portail affilié et un
back-office administrateur.

**4. Glossaire et concepts clés**

Ce glossaire fixe le vocabulaire du projet. Un terme employé ailleurs
dans le document a exactement le sens défini ici.

| **Terme**                               | **Définition**                                                                                                                                                                                                 |
|-----------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| BV / Points                             | Grandeur de l'ARBRE (D-028), en points entiers, SANS valeur monétaire. Sert uniquement à composer le palier d'un pack et à alimenter les jambes binaires. Ne se convertit jamais en dinars, ne se dépense pas. |
| DT (dinar tunisien)                     | Grandeur de l'ARGENT (D-028) : TOUT le monétaire — soldes, e-cards, grand livre, commissions, plafonds, prix des produits ET des packs. Transactionnel (3 décimales, le millime). Aucune passerelle : le règlement se fait hors système via e-cards. |
| Affilié / Membre                        | Personne inscrite au réseau, identifiée par un code membre unique. Peut parrainer, être placée dans l'arbre, acheter des produits et percevoir des commissions.                                                |
| Sponsor (parrain)                       | Membre qui a référé un nouvel affilié. Déclenche la commission directe. Lien logique, distinct du placement.                                                                                                   |
| Upline de placement                     | Membre sous lequel le nouvel affilié est physiquement rattaché dans l'arbre binaire (jambe gauche ou droite). Détermine la circulation des points. Peut être différent du sponsor.                             |
| Jambe (gauche / droite)                 | Chacune des deux branches sous un nœud binaire. Les points s'accumulent séparément par jambe.                                                                                                                  |
| Downline                                | Ensemble des affiliés situés sous un membre dans l'arbre.                                                                                                                                                      |
| Pack (Silver / Gold / Safari / Diamond) | Deux dimensions (D-028, D-029) : un PALIER en points (composé par le panier, injecté dans l'arbre) et un PRIX en DT (ce que l'activation fait payer). Le prix n'est pas la conversion du palier ni la somme des prix du panier. |
| Palier                                  | Valeur en POINTS requise pour composer un pack (Silver 1000, Gold 2000, Safari 3000, Diamond 4000). Paramétrable par l'admin.                                                                                  |
| E-card                                  | Instrument de paiement à usage unique, libellé en DT (D-028), au format XXX-XXX-XXX-XXX. Créé depuis le solde DT d'un membre, transférable, brûlé après utilisation.                                            |
| Commission directe                      | Montant (DT) versé au sponsor lorsqu'un filleul active un pack.                                                                                                                                                |
| Commission indirecte                    | Montant (DT) versé au titre de l'équilibre des points entre jambe gauche et jambe droite (mécanique binaire par cycles).                                                                                       |
| Cycle / équilibre                       | Un cycle est atteint lorsque chaque jambe accumule un multiple du palier du membre. Chaque cycle complet paie la commission indirecte.                                                                         |
| Plafond hebdomadaire                    | Montant maximal de commission (DT) qu'un membre peut percevoir sur une semaine, selon son pack. Le dépassement est perdu.                                                                                      |
| Carry-over (report)                     | Points de la jambe forte non appariés à la fin de la semaine : ils sont reportés à la semaine suivante (jamais perdus).                                                                                        |
| Run de commissions                      | Exécution hebdomadaire (cron) qui calcule et crédite les commissions. Reset le vendredi à 23:59, heure de Tunis.                                                                                               |
| Snapshot                                | Figement des valeurs paramétrables (palier en points, prix et commissions/plafonds en DT, valeur BV produit) au moment d'une transaction, pour préserver l'intégrité historique.                               |

**5. Règles de gestion (spécification normative)**

Cette section est le cœur de la spécification. Elle décrit le
comportement attendu du système. En cas de doute, elle prime sur les
descriptions fonctionnelles des écrans.

**5.1 Principes monétaires — modèle à DEUX dimensions (D-028)**

Le système manipule deux grandeurs de natures totalement différentes, qui **ne se croisent
jamais** et entre lesquelles **aucune conversion n'existe** nulle part.

- **POINTS (BV) — l'arbre.** Des entiers, sans valeur monétaire. Ils servent à exactement deux
  choses : (1) composer le panier au **palier** d'un pack à l'activation, (2) alimenter les
  **jambes** de l'arbre binaire. Un point ne vaut jamais de l'argent, ne se dépense pas, ne se
  crédite pas à un solde.

- **DINARS (DT) — le portefeuille.** **Tout l'argent** du système : solde d'un membre, valeur
  d'une e-card, grand livre, commissions, plafond hebdomadaire, prix des produits, prix des
  packs. Le dinar est **transactionnel** (révision de D-002). Précision : 3 décimales, le
  millime (`Decimal(12,3)`).

  > **Règle mnémotechnique : l'arbre compte des points, le portefeuille compte des dinars.**

- **Aucun fiat dans le système** (D-001 inchangé au fond). La plateforme n'intègre aucune
  passerelle de paiement. Elle génère, valide et « brûle » des e-cards — libellées en DT ;
  l'argent liquide correspondant change de main **hors plateforme**, entre les personnes
  concernées.

- **Le pack porte les deux dimensions, sans lien entre elles.** Un Silver, c'est **1000 points**
  (ce que l'arbre reçoit) pour **2200 DT** (ce que l'activation fait payer, D-029). Ces deux
  nombres n'ont aucun rapport arithmétique : chercher un « taux » entre eux est un contresens.

- **Le produit aussi.** Sa **valeur BV** (points) compose les paliers ; son **prix DT** est ce
  qu'il coûte en achat libre. Deux produits de même valeur BV peuvent avoir des prix différents.

*Historique : la section 6 exprimait le plan de rémunération en nombres (Silver : directe 500,
indirecte 250, plafond 10000) sous un encadré « à confirmer ». Faute de confirmation, ils
avaient d'abord été repris en BV. La cliente a tranché : ce sont des **DINARS** (D-028).*

**5.2 Structure du réseau binaire**

- **Deux liens distincts.** Chaque affilié possède un sponsor (déclenche
  la commission directe) et un upline de placement (position dans
  l'arbre, déclenche la mécanique binaire). Les deux sont saisis à
  l'inscription et peuvent désigner des membres différents.

- **Placement explicite.** Le sponsor choisit l'upline de placement et
  la jambe (gauche ou droite). Il n'y a aucun débordement automatique
  (spillover) : si la position visée est déjà occupée, le sponsor doit
  choisir une autre position libre.

- **Circulation des points.** Seule l'activation d'un compte injecte des
  points dans l'arbre. À l'activation, la valeur du palier du nouveau
  membre est créditée sur la jambe concernée de chacun de ses uplines
  successifs, jusqu'à la racine.

- **Les achats de produits n'alimentent pas l'arbre.** Aucun achat de
  produit (hors activation) ne génère de BV réseau ni ne modifie les
  jambes. Confirmé par la cliente.

- **Immuabilité du placement.** Une fois une activation posée, le
  placement ne peut plus être modifié (cohérence de l'arbre et des
  commissions déjà calculées).

**5.3 Inscription et activation**

Scénario de référence : un membre (ex. Chams, NP000906) parraine un
nouveau venu (Mohamed) et le place sous un upline (ex. Aymen, NP000915)
en jambe gauche.

- Le membre clique sur « Inscription » et remplit le formulaire
  (informations du nouvel affilié, code sponsor, code upline de
  placement, jambe gauche/droite).

- Le nouvel affilié règle 100 DT de frais d'inscription en espèces, hors
  système.

- Le système attribue immédiatement un code membre auto-incrémenté
  (dernier NP001023 → nouveau NP001024). Le compte passe à l'état
  INSCRIT ; la position dans l'arbre est attribuée définitivement
  (sponsor + upline + jambe). Dès cet instant, le membre existe dans
  l'arbre et peut recevoir des downlines à gauche et à droite, même s'il
  n'a pas encore activé.

- Le nouvel affilié accède à son compte, compose un panier de produits
  dont la somme des **points (BV)** égale exactement le palier de son pack
  (ex. Silver = 1000 points), saisit une e-card dont la valeur en **DT**
  égale exactement le **prix du pack** (ex. Silver = 2200 DT — D-029, ce
  n'est pas la somme des prix des produits du panier) et finalise.

- L'achat étant finalisé, le compte devient ACTIF automatiquement, sans
  validation administrateur. Les **points** du palier sont injectés vers ses
  uplines (l'arbre ne voit jamais de dinar). Le compteur de commissions du membre démarre à cet instant :
  une baseline (instantané) des points déjà présents sur ses deux jambes
  est figée, de sorte que seuls les points arrivés APRÈS l'activation
  comptent pour ses propres commissions (voir 5.8).

|                                                                                                                                                                                                                 |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Règle clé —** L'inscription initiale ne nécessite AUCUNE validation admin : l'activation est automatique dès l'achat par e-card finalisé. (Le renouvellement annuel, lui, est validé par l'admin — voir 5.9.) |

**5.4 Cycle de vie de l'adhésion**

Décision cliente (confirmée) : un inscrit non finalisé n'est jamais
supprimé et occupe sa place définitivement. L'adhésion suit trois états.

- **INSCRIT —** créé à la soumission du formulaire : code attribué,
  placement définitif (sponsor + upline + jambe). Le membre existe dans
  l'arbre et peut recevoir des downlines à gauche et à droite. Il
  persiste indéfiniment, même s'il n'active jamais. Aucun point injecté et
  aucune commission tant qu'il n'est pas ACTIF ; le run hebdomadaire ne
  lui verse rien.

- **ACTIF —** l'achat par e-card est finalisé (panier au palier exact en
  points, e-card au prix du pack en DT). Les points du palier sont injectés
  vers ses uplines, sa baseline est figée et son compteur de commissions
  démarre. Il entre dans le calcul
  des commissions (pour les points postérieurs à l'activation
  uniquement).

- **INACTIF —** membre auparavant ACTIF qui n'a pas renouvelé son
  inscription annuelle. Ne perçoit plus de commissions jusqu'à
  régularisation validée par l'admin (voir 5.9).

**Règles complémentaires :**

- Aucune expiration. Il n'existe ni délai de finalisation, ni état
  EXPIRÉ, ni cron de libération de place : un INSCRIT reste indéfiniment
  dans l'arbre.

- Placement définitif dès l'inscription. Une position occupée par un
  INSCRIT ne peut plus être attribuée à un autre membre (pas de conflit
  d'arbre). En cas de tentative simultanée sur la même position, le
  premier inscrit l'emporte.

- Baseline à l'activation. Les downlines et points accumulés pendant la
  phase INSCRIT ont servi à construire l'arbre et sont remontés aux
  uplines actifs, mais ne comptent jamais dans les commissions propres
  du membre : seuls les points postérieurs à son activation sont pris en
  compte (voir 5.8 et section 10).

- Consommation atomique de l'e-card : l'e-card n'est brûlée que si
  l'achat aboutit entièrement. Un achat interrompu laisse l'e-card
  ACTIVE et le membre en état INSCRIT.

|                                                                                                                                                                                                                                                                                      |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Point d'attention —** Sans expiration, un membre peut payer les 100 DT uniquement pour occuper des positions stratégiques et recevoir des downlines sans jamais activer. C'est un choix assumé de la cliente ; les 100 DT de frais d'inscription constituent la barrière d'entrée. |

**5.5 E-cards**

- **Format.** Code alphanumérique à quatre groupes de trois caractères :
  XXX-XXX-XXX-XXX (ex. HHD-7Z7-JJD-77D). Unicité garantie (régénération
  en cas de collision). Distinct du code membre (préfixe NP + numéro) :
  aucune confusion possible.

- **Libellé en BV.** Une e-card porte une valeur en BV.

- **Création plafonnée au solde.** Un affilié ne peut créer une e-card
  que dans la limite de son solde BV disponible. La création débite
  immédiatement le solde et passe l'e-card à l'état ACTIVE.

- **Transférable, usage unique.** L'e-card est transmise à un autre
  membre (le cash correspondant se règle hors plateforme). Elle est
  brûlée (USED) après utilisation ; une utilisation est définitive et
  irréversible.

- **Couverture exacte.** Un achat par e-card exige une valeur égale
  exactement au montant BV dû. Pas de trop-perçu, une seule e-card par
  transaction.

- **Expiration paramétrable.** Durée de validité configurable en jours ;
  la valeur -1 signifie « illimité ». À l'expiration (EXPIRED) comme à
  la révocation admin (REVOKED), le BV est recrédité au créateur de
  l'e-card. Une action « prolonger » permet de repousser l'échéance.

- **Genèse du réseau.** Les premiers affiliés n'ayant aucun BV,
  l'administrateur peut générer des e-cards (et du BV) à volonté pour
  amorcer le réseau et pour des promotions.

**5.6 Packs et composition**

- **Pack = palier en BV.** Silver 1000, Gold 2000, Safari 3000, Diamond
  4000 (valeurs paramétrables).

- **Composition exacte.** Pour activer un pack, la somme des BV des
  produits du panier doit égaler exactement le palier (ex. Silver = 1000
  BV pile). L'admin doit donc définir des produits dont les valeurs BV
  se combinent proprement vers chaque palier.

- **BV injecté = palier.** L'activation injecte dans l'arbre la valeur
  du palier (montant fixe et déterministe).

**5.7 Boutique et produits**

- **Création produit.** L'admin crée un produit avec : nom, description,
  catégorie, prix de référence en DT, valeur BV (attribuée
  manuellement), type (physique ou virtuel), stock (si physique), frais
  de livraison, et promotion éventuelle.

- **Promotion.** Une promotion réduit le prix de référence en DT ; la
  valeur BV reste inchangée.

- **Achat hors inscription.** Un affilié connecté peut acheter librement
  des produits en dehors de toute activation. Le paiement se fait par
  e-card. Cet achat n'a AUCUN effet sur l'arbre ni sur le BV réseau.

- **Livraison.** Les frais de livraison (produits physiques) se règlent
  hors système (espèces ou inclus dans l'arrangement e-card). La
  plateforme n'encaisse rien ; elle peut suivre le statut d'expédition.

**5.8 Moteur de commissions (règles)**

- **Périodicité.** Calcul hebdomadaire par cron. Reset le vendredi à
  23:59, heure de Tunis (UTC+1, sans changement d'heure : bornes
  déterministes).

- **Commission directe.** Versée au sponsor pour chaque filleul ayant
  activé un pack durant la période, selon le pack du filleul. La
  commission directe compte dans le plafond hebdomadaire.

- **Commission indirecte.** Fondée sur l'équilibre des jambes. À chaque
  cycle complet (le palier du membre atteint sur chacune des deux
  jambes), le membre perçoit le montant indirect de son pack.

- **Bonus de démarrage (early payout).** Décision cliente (confirmée) :
  pour motiver les nouveaux membres, les premiers paliers déséquilibrés
  sont rémunérés à la commission indirecte, sans exiger l'équilibre.
  Chaque membre dispose d'une réserve à vie de 6 paliers de démarrage
  (au total, toutes jambes confondues ; seuil paramétrable, défaut 6).
  Tant que cette réserve n'est pas épuisée, la commission indirecte est
  payée sur les paliers non appariés de la jambe forte (ex. Silver : 250
  BV par tranche de 1000 points). Les points ainsi payés sont consommés
  et ne servent plus à un futur équilibrage (pas de double paiement).
  Réserve épuisée, le membre revient au régime normal (report des
  points). Ce bonus démarre à l'activation et compte dans le plafond
  hebdomadaire.

- **Baseline à l'activation.** Les commissions d'un membre ne portent
  que sur les points arrivés après son passage en ACTIF. Un instantané
  des points présents sur ses deux jambes est figé au moment de
  l'activation ; les points antérieurs (accumulés pendant sa phase
  INSCRIT) sont exclus de son calcul, tout en ayant profité à ses
  uplines actifs.

- **Report des points (carry-over).** Les points de la jambe forte non
  appariés en fin de semaine (et non payés au titre du bonus de
  démarrage) sont reportés à la semaine suivante ; rien n'est perdu côté
  points.

- **Plafond hebdomadaire.** La commission totale (directe + indirecte)
  est plafonnée selon le pack. Tout dépassement de commission est perdu
  (non reporté).

- **Snapshot.** Chaque commission et activation fige les paramètres
  applicables (palier, montants, plafond) au moment de la transaction.
  Une modification ultérieure de la configuration ne réécrit jamais
  l'historique et ne s'applique qu'à partir du run suivant.

**5.9 Renouvellement annuel**

- **Obligation annuelle.** Chaque membre doit renouveler son inscription
  une fois par an, pour 100 DT (valeur BV paramétrable), payable par
  e-card ou en espèces hors système.

- **Validation admin.** Contrairement à l'inscription initiale, le
  renouvellement est activé par l'administrateur.

- **Compte non renouvelé.** Un compte non renouvelé devient inactif : il
  ne perçoit plus de commissions tant que la régularisation n'est pas
  validée.

**5.10 Authentification, notifications, langue**

- **Authentification.** Connexion par e-mail, numéro de téléphone ou
  code membre, avec mot de passe. Récupération de mot de passe prévue.
  Pas de KYC (aucune vérification d'identité, aucune donnée bancaire
  collectée).

- **Notifications.** Toutes les notifications sont in-app uniquement
  (aucun e-mail ni SMS ; aucun fournisseur externe prévu à ce stade).

- **Langue.** Français au lancement. Support de l'arabe et interface RTL
  prévus pour une phase future : le code doit être pensé pour
  l'internationalisation (i18n) dès le départ.

- **Plateforme.** Web 100 % responsive. Aucune application mobile
  native.

**6. Plan de rémunération**

**6.1 Packs et paliers**

Deux dimensions par pack (D-028, D-029), sans conversion entre elles : le **palier** est en
**POINTS** (ce que le panier compose et ce que l'arbre reçoit) ; le **prix** et tout le plan de
rémunération (commissions, plafond) sont en **DINARS**. Le prix est ce que l'activation fait
**payer** — pas la conversion du palier, pas la somme des prix des produits du panier.

| **Pack** | **Palier (points)** | **Prix du pack (DT)** | **Comm. directe (DT)** | **Comm. indirecte (DT)** | **Plafond / sem. (DT)** |
|----------|---------------------|-----------------------|------------------------|--------------------------|-------------------------|
| Silver   | 1000                | 2200                  | 500                    | 250                      | 10000                   |
| Gold     | 2000                | 3350                  | 700                    | 400                      | 16000                   |
| Safari   | 3000                | 5400                  | 900                    | 600                      | 24000                   |
| Diamond  | 4000                | 8350                  | 1200                   | 900                      | 36000                   |

**6.2 Commissions directes**

Lorsqu'un affilié parraine une personne qui active un pack, il perçoit
une commission directe selon le pack du filleul : Silver 500, Gold 700,
Safari 900, Diamond 1200 (**DT**). Cette commission compte dans le plafond
hebdomadaire du sponsor.

**6.3 Commissions indirectes**

La commission indirecte récompense l'équilibre des points entre jambe
gauche et jambe droite. Pour chaque cycle complet — le palier du membre
atteint sur chacune des deux jambes — le membre perçoit le montant
indirect de son pack.

| **Pack** | **Condition (équilibre par cycle)**   | **Gain par cycle (DT)** |
|----------|---------------------------------------|-------------------------|
| Silver   | 1000 points à gauche ET 1000 à droite | 250                     |
| Gold     | 2000 à gauche ET 2000 à droite        | 400                     |
| Safari   | 3000 à gauche ET 3000 à droite        | 600                     |
| Diamond  | 4000 à gauche ET 4000 à droite        | 900                     |

Aucune commission indirecte n'est due tant que l'équilibre requis (le
palier sur chaque jambe) n'est pas atteint — sauf au titre du bonus de
démarrage ci-dessous. Les points non appariés de la jambe forte sont
reportés (carry-over).

**6.4 Bonus de démarrage (early payout)**

Pour motiver les nouveaux membres, les premiers paliers déséquilibrés
sont rémunérés à la commission indirecte, sans exiger l'équilibre.
Chaque membre dispose d'une réserve à vie de 6 paliers (au total, toutes
jambes confondues ; paramétrable). Exemple Silver : les 6 premières
tranches de 1000 points reçues sur la jambe forte, avant tout équilibre,
rapportent 250 DT chacune. Les points payés à ce titre sont consommés
(ils ne comptent plus pour un futur équilibre). Une fois la réserve
épuisée, le membre revient au régime normal. Le bonus démarre à
l'activation et compte dans le plafond hebdomadaire.

**6.5 Plafond hebdomadaire**

La commission totale hebdomadaire (directe + indirecte + bonus de
démarrage) est plafonnée : Silver 10000, Gold 16000, Safari 24000,
Diamond 36000 (**DT**). Au-delà, la commission excédentaire de la semaine
est perdue (non reportée). À distinguer du report des points de la jambe
forte, qui, lui, est conservé.

**7. Description fonctionnelle**

La plateforme se compose de trois interfaces : le portail affilié, le
back-office administrateur et le site vitrine public.

**7.1 Portail affilié**

**7.1.1 Tableau de bord**

Vue d'ensemble de l'activité du membre : pack, statut (actif / à
renouveler), solde BV, points accumulés par jambe (gauche / droite),
commissions de la semaine et cumulées, nombre de downlines, e-cards
actives. Rappel de la date du prochain run et de l'échéance de
renouvellement.

**7.1.2 Connexion / Inscription**

Connexion par e-mail, téléphone ou code membre + mot de passe, avec
récupération de mot de passe. Formulaire d'inscription permettant de
parrainer et placer un nouvel affilié (saisie du code sponsor, du code
upline de placement et de la jambe gauche/droite), conformément au cycle
de la section 5.3–5.4.

**7.1.3 E-cards**

- Créer une e-card : saisir une valeur en BV (≤ solde disponible) ; le
  solde est débité et un code XXX-XXX-XXX-XXX est généré.

- Mes e-cards : liste des e-cards créées avec valeur, statut (ACTIVE /
  USED / REVOKED / EXPIRED), dates de création, d'utilisation et
  d'expiration.

- Vérifier une e-card : contrôler la validité et la valeur d'un code.

- Utiliser une e-card : lors d'un achat (activation ou achat libre),
  saisir un code dont la valeur BV égale exactement le montant dû.

**7.1.4 Achat de produits**

Boutique avec panier et checkout. Deux contextes : (a) activation d'un
pack — le panier doit totaliser exactement le palier, puis saisie
sponsor + upline + jambe + e-card ; (b) achat libre par un affilié actif
— paiement e-card, sans effet réseau. Aucun paiement en ligne : le
règlement passe toujours par e-card, la livraison des produits physiques
étant gérée hors système.

**7.1.5 Visualisation de l'arbre**

Vue graphique de l'arbre binaire du membre : sa position, ses jambes
gauche et droite, ses parrainages directs et indirects, les points par
jambe.

**7.1.6 Liste des downlines**

Liste complète des downlines avec nom, code, pack, statut, jambe, date
d'activation et points générés.

**7.1.7 Gestion de profil**

Gestion des informations personnelles (nom, coordonnées, contact),
préférences et sécurité (mot de passe). Aucune donnée bancaire n'est
collectée (pas de KYC, pas de virement).

**7.2 Back-office administrateur**

Le back-office est une application React + shadcn/ui. Il couvre douze
modules.

**7.2.1 Tableau de bord**

Cartes KPI : membres totaux et actifs, inscriptions du jour et de la
semaine, répartition des packs vendus, BV total en circulation, e-cards
actives / utilisées, résultat du dernier run de commissions, date du
prochain run. Graphiques de croissance du réseau et d'activations par
jour.

**7.2.2 Gestion des membres**

Table (code, nom, pack, statut, date d'activation, solde BV, upline,
downlines G/D) avec filtres par pack / statut / période. Fiche membre :
infos, position dans l'arbre, jambes, historique BV, e-cards,
commissions. Actions : bloquer / débloquer, ajustement manuel de BV
(motif tracé), consulter l'arbre, suivre le compteur de bonus de
démarrage restant.

**7.2.3 Généalogie du réseau**

Vue graphique de l'arbre binaire complet, recherche par membre pour
recentrer l'arbre, affichage des points par jambe, zoom, export.

**7.2.4 Gestion des packs**

CRUD des paliers Silver / Gold / Safari / Diamond : palier BV, prix de
référence DT, commission directe, commission indirecte + condition
d'équilibre, plafond hebdomadaire. Activer / désactiver un pack.
Validation des valeurs (aucune valeur ≤ 0, plafond ≥ commissions).

**7.2.5 Gestion des produits**

CRUD : nom, description, prix DT, valeur BV, catégorie, type physique /
virtuel, stock, frais de livraison, images, promotion, visibilité
vitrine. Gestion des catégories.

**7.2.6 Gestion des commandes**

Liste des commandes produits (membre, articles, total, statut, date).
Détail et suivi des statuts pour les produits physiques (préparation →
expédié → livré). Filtres.

**7.2.7 Moteur de commissions**

Supervision des runs hebdomadaires (automatiques). Historique des runs
(date, membres traités, BV distribué, plafonds appliqués, succès /
erreur). Détail d'un run : décomposition par membre (directes /
indirectes / plafond appliqué / points reportés), log d'exécution.
Relance de secours et rollback d'un run.

**7.2.8 Soldes BV et mouvements**

Registre des soldes par membre et journal des mouvements (commission
créditée, e-card créée / débitée, e-card utilisée / recréditée,
remboursement sur expiration ou révocation, ajustement admin). Recherche
par membre, ajustement manuel tracé.

**7.2.9 Gestion des e-cards**

Table (code, valeur BV, créateur, utilisateur, statut, dates création /
utilisation / expiration). Recherche par code, traçabilité complète
création → utilisation. Actions : générer une e-card (promotions,
amorçage), révoquer (avec remboursement au créateur), prolonger
l'échéance.

**7.2.10 Rapports et analytics**

Ventes produits, activations par pack, commissions par période, BV en
circulation, top affiliés. Exports CSV.

**7.2.11 Paramètres système**

Règles de commissions et plafonds par pack, mapping BV ↔ pack (paliers),
format / préfixe des codes e-card, durée d'expiration des e-cards (-1 =
illimité), nombre de paliers du bonus de démarrage (défaut 6),
planification du cron (jour / heure, Tunis), valeur BV du renouvellement
annuel, devise d'affichage.

**7.2.12 Comptes admin et rôles (RBAC)**

CRUD des comptes administrateurs, rôles (super-admin, gestionnaire,
support), permissions par module, journal de connexion.

*Modules optionnels (selon budget / priorité) : gestion du contenu du
site vitrine (pages, galerie), journal d'audit global, annonces /
notifications in-app aux affiliés.*

**7.3 Site vitrine (public)**

Site public en Next.js (SSR/SSG) optimisé pour le référencement. Le
style de référence validé est éditorial, à dominante blanche,
typographie Montserrat Bold, accent or Najah (#C6B23E pour les aplats,
\#9A8A2E pour le texte sur blanc), verts olive \#7B9455 / \#5A6E3A, fond
quasi-noir \#0E0E0C.

- **Page d'accueil.** Présentation de l'entreprise et de la plateforme,
  mise en avant des produits et des valeurs, hero typographique
  bicolore.

- **Page produits.** Catalogue des produits (grilles par catégories)
  avec descriptions détaillées.

- **Page galerie.** Vitrine visuelle des événements, formations et
  rencontres de la communauté.

- **Page Qui sommes-nous.** Histoire, valeurs et mission de
  l'entreprise.

- **Page Contact.** Prise de contact.

- **Pied de page de conformité.** Liens légaux et réglementaires en tête
  de footer (CGU, confidentialité, code de conduite, politique de
  revenus) pour gérer l'exposition réglementaire MLM.

**8. Modèle de données**

Modèle indicatif pour PostgreSQL. Les relations d'arbre binaire se
prêtent aux requêtes récursives (CTE). Toute valeur paramétrable doit
être figée par snapshot au moment des transactions (activation,
commission, e-card).

| **Entité**    | **Champs clés**                                                                                                                                                                                                                                                                 | **Relations**                                                  |
|---------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| Affilie       | id, code_membre (NP…), nom, prénom, contacts, mot_de_passe (hash), statut (INSCRIT / ACTIF / INACTIF), pack_id, sponsor_id, upline_id, jambe (G/D), solde_bv, date_inscription, date_activation, baseline_gauche, baseline_droite, bonus_demarrage_restant, date_renouvellement | sponsor → Affilie ; upline → Affilie (placement) ; pack → Pack |
| Pack          | id, nom, palier_bv, prix_ref_dt, comm_directe_bv, comm_indirecte_bv, plafond_hebdo_bv, actif                                                                                                                                                                                    | —                                                              |
| NoeudArbre    | affilie_id, upline_id, jambe, points_gauche, points_droite, points_reportes_gauche, points_reportes_droite                                                                                                                                                                      | affilie ↔ Affilie ; upline ↔ Affilie                           |
| GrandLivreBV  | id, affilie_id, type_mouvement, montant_bv, reference (ecard/commission/ajustement), solde_apres, date                                                                                                                                                                          | affilie → Affilie                                              |
| Ecard         | id, code (XXX-XXX-XXX-XXX), valeur_bv, createur_id, utilisateur_id, statut (ACTIVE/USED/REVOKED/EXPIRED), date_creation, date_utilisation, date_expiration                                                                                                                      | createur → Affilie ; utilisateur → Affilie                     |
| Commission    | id, affilie_id, run_id, type (DIRECTE/INDIRECTE), montant_bv, plafond_applique, cycles, snapshot_params, date                                                                                                                                                                   | affilie → Affilie ; run → RunCommission                        |
| RunCommission | id, date_execution, periode_debut, periode_fin, nb_membres, bv_distribue, statut (SUCCÈS/ERREUR), log                                                                                                                                                                           | —                                                              |
| Produit       | id, nom, description, categorie_id, prix_dt, valeur_bv, type (PHYSIQUE/VIRTUEL), stock, frais_livraison, promo_prix_dt, actif, visible_vitrine                                                                                                                                  | categorie → Categorie                                          |
| Commande      | id, affilie_id, contexte (ACTIVATION/LIBRE), lignes\[\], total_bv, ecard_id, statut, adresse_livraison, statut_expedition, date                                                                                                                                                 | affilie → Affilie ; ecard → Ecard                              |
| AdminUser     | id, nom, email, mot_de_passe (hash), role, permissions                                                                                                                                                                                                                          | —                                                              |
| Parametre     | clé, valeur, description                                                                                                                                                                                                                                                        | —                                                              |
| JournalAudit  | id, acteur (admin/système), action, cible, avant, après, date                                                                                                                                                                                                                   | —                                                              |

**9. Machines à états**

**9.1 Adhésion**

INSCRIT → (achat e-card finalisé) → ACTIF ; ACTIF → (renouvellement
annuel non validé) → INACTIF ; INACTIF → (renouvellement validé par
l'admin) → ACTIF. Il n'y a pas d'état EXPIRÉ ni d'expiration : un
INSCRIT persiste indéfiniment. Le placement est définitif dès l'entrée
en INSCRIT. À l'entrée en ACTIF, la baseline des points est figée et la
réserve de bonus de démarrage (défaut 6) est initialisée.

**9.2 E-card**

ACTIVE → (utilisée pour un achat) → USED ; ACTIVE → (échéance atteinte)
→ EXPIRED ; ACTIVE → (révocation admin) → REVOKED. Les transitions vers
EXPIRED et REVOKED recréditent le BV au créateur. USED est définitif et
irréversible.

**10. Moteur de commissions — algorithme hebdomadaire**

Exécuté par cron, période close le vendredi 23:59 (heure de Tunis). Pour
chaque membre actif :

Exécuté par cron, période close le vendredi 23:59 (heure de Tunis). Les
membres INSCRIT (non activés) sont ignorés : ils n'ont pas de compteur
de commissions. Pour chaque membre ACTIF :

- Injection des activations de la semaine : pour chaque nouvelle
  activation, la valeur du palier du nouvel affilié a déjà été ajoutée,
  au fil de l'eau, à la jambe correspondante de chacun de ses uplines
  actifs (gauche ou droite selon la position).

- Points éligibles (baseline) : seuls les points arrivés après
  l'activation du membre sont pris en compte. totalGauche =
  pointsReportésGauche + pointsSemaineGauche − baseline déjà retranchée
  ; idem à droite. (Concrètement, la baseline est soustraite une seule
  fois, à l'activation ; ensuite on ne compte que le flux postérieur.)

- Cycles équilibrés : matched = min(totalGauche, totalDroite) ; nbCycles
  = partie entière de (matched / palierDuMembre).

- Commission indirecte (équilibre) = nbCycles ×
  commissionIndirecte(pack). Consommé = nbCycles × palier sur chaque
  jambe.

- Bonus de démarrage : soit reste = bonusDémarrageRestant (défaut
  initial 6). Après consommation des cycles équilibrés, on considère les
  paliers excédentaires de la jambe forte : nbBonus = min(reste, partie
  entière de (excédentJambeForte / palier)). Commission bonus = nbBonus
  × commissionIndirecte(pack). On décrémente bonusDémarrageRestant de
  nbBonus et on consomme nbBonus × palier de points sur la jambe forte
  (ces points ne seront plus reportés).

- Report : pointsReportés(suivant) sur chaque jambe = points restants
  après consommation des cycles équilibrés ET des paliers de bonus. Les
  points non appariés et non payés sont reportés.

- Commission directe = somme, sur les filleuls activés durant la
  période, de commissionDirecte(pack du filleul).

- Total = commissionDirecte + commissionIndirecte + bonusDémarrage. Si
  Total \> plafondHebdo(pack) : verser plafondHebdo, l'excédent est
  perdu (non reporté).

- Crédit : le montant retenu est crédité en BV au solde du membre
  (GrandLivreBV) ; chaque ligne de commission fige ses paramètres
  (snapshot).

|                                                                                                                                                                                                                                                                                                                            |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Distinction essentielle —** Deux « débordements » au comportement opposé : les points non appariés de la jambe forte sont REPORTÉS (jamais perdus, sauf s'ils ont été payés au titre du bonus de démarrage, auquel cas ils sont consommés) ; la commission au-delà du plafond hebdomadaire est PERDUE (jamais reportée). |

**11. Description technique**

**11.1 Stack technologique**

**NestJS (Backend / API)**

Framework Node.js basé sur TypeScript, à l'architecture modulaire et à
l'injection de dépendances native. Il centralise toute la logique métier
MLM (calcul des commissions directes et indirectes, gestion des
parrainages et du placement, traitement des transactions BV et e-cards)
et expose une API REST consommée par le portail affilié et le
back-office. Le typage fort de TypeScript apporte une fiabilité
essentielle sur les calculs financiers.

**Next.js (Site vitrine)**

Framework React avec rendu côté serveur (SSR) et génération statique
(SSG), garantissant un excellent référencement (SEO) et des temps de
chargement optimaux pour les pages produits et institutionnelles.

**React + shadcn/ui (Portail affilié et back-office)**

React pour des interfaces mono-page (SPA) réactives. shadcn/ui fournit
des composants accessibles, cohérents et personnalisables (basés sur
Tailwind CSS et Radix), pour une interface moderne et homogène entre le
portail affilié et le back-office administrateur.

**PostgreSQL (Base de données)**

SGBDR robuste et transactionnel (ACID), adapté aux relations complexes
du réseau (arbre de parrainage, équilibre de points, commissions). Ses
requêtes récursives (CTE) sont particulièrement efficaces pour parcourir
l'arbre binaire et calculer les downlines.

**11.2 Architecture à trois niveaux**

- **Niveau présentation.** Next.js (site vitrine public) et React +
  shadcn/ui (portail affilié et back-office administrateur).

- **Niveau logique.** NestJS : cœur métier MLM, API REST, calculs de
  commissions, gestion des transactions BV / e-cards, cron hebdomadaire
  et cron quotidien d'expiration.

- **Niveau données.** PostgreSQL : membres, arbre, grand livre BV,
  e-cards, commissions, produits, commandes, paramètres et audit.

**11.3 Principes architecturaux**

- **Modularité.** Découpage en modules indépendants (présentation,
  logique, données) pour une maintenance et des évolutions aisées.

- **Séparation des responsabilités.** Interface dans la présentation,
  logique MLM dans le backend, persistance en base.

- **Scalabilité.** Architecture évolutive supportant un nombre croissant
  de membres et de transactions.

- **Sécurité.** Authentification et autorisation à chaque couche,
  protection des données et des opérations sur le BV.

- **Internationalisation.** Conception i18n dès le départ (français au
  lancement, arabe / RTL en phase future).

**12. Sécurité et conformité**

- **Codes = valeur.** Les codes e-card représentent de la valeur :
  unicité garantie, génération aléatoire non prédictible, et limitation
  de débit (rate-limiting) sur la validation pour prévenir le
  brute-force.

- **Intégrité transactionnelle.** Opérations sur le solde BV et
  consommation d'e-card atomiques (transactions base de données) ;
  snapshot des paramètres au moment de chaque transaction.

- **Journalisation.** Audit des actions sensibles (ajustements BV,
  génération / révocation d'e-cards, modifications de packs et
  paramètres, expirations d'inscriptions).

- **Aucun fiat.** La plateforme ne détient et ne transfère aucune
  monnaie : elle tient un registre de points (BV) et un générateur /
  validateur de codes uniques. Cela réduit la surface de conformité liée
  aux paiements.

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Point d'attention réglementaire —** Le plan de rémunération est fortement orienté sur l'inscription et l'achat de packs. C'est le critère qui, juridiquement, distingue un MLM légitime d'un système pyramidal, dont la commercialisation est encadrée voire interdite selon les juridictions. Il est recommandé de faire valider le montage par un conseil juridique et d'encadrer la responsabilité dans le contrat de prestation. Le pied de page de conformité du site vitrine participe à cette gestion du risque. |

**13. Qualités**

- **Suivi du projet.** Développement modulaire, chaque livrable validé
  indépendamment, idéalement avec le responsable projet côté client.

- **Ergonomie.** Interfaces intuitives et conviviales, côté portail
  affilié comme côté back-office.

- **Compatibilité.** Web responsive, optimisé pour les navigateurs
  courants (Chrome, Firefox, Safari).

- **Montée en charge.** Architecture évolutive et tests de charge pour
  absorber les pics d'activité (notamment autour du run hebdomadaire).

- **Gestion du risque.** Plan de gestion des risques, mesures de
  sécurité des données et sauvegardes régulières.

**14. Démarche de réalisation**

Une équipe pluridisciplinaire est constituée autour des rôles suivants.

**Développeur Fullstack**

Responsabilités : concevoir et développer l'architecture logicielle
(frontend Next.js / React + shadcn, backend NestJS), intégrer les
fonctionnalités, assurer maintenance et optimisation. Compétences :
maîtrise de TypeScript, NestJS, React / Next.js, PostgreSQL ; expérience
du développement d'applications web.

**Chef de projet**

Responsabilités : planifier, organiser et superviser le projet,
communiquer avec les parties prenantes, allouer les ressources.
Compétences : gestion de projets logiciels, communication et leadership.

**15. Offre financière**

**15.1 Coût des ressources humaines (jour/homme)**

- Développeur Fullstack : 100 DT / jour

- Chef de projet : 150 DT / jour

**15.2 Durée des travaux (jour/homme)**

- Développeur Fullstack : 80 jours

- Chef de projet : 40 jours

**15.3 Frais supplémentaires**

- Serveur VPS : à partir de 40 DT / mois (480 DT / an)

- Hébergement et nom de domaine (à préciser)

- Maintenance : gratuite (quota 4 h / mois)

|                                                                                                                                                                                                                                                                                                                                                         |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **\[À CADRER\] —** Le périmètre a été enrichi depuis le devis initial (moteur de commissions, machine à états d'inscription, back-office à 12 modules, e-cards paramétrables). Il est recommandé de réévaluer la charge du moteur de commissions et de préciser le total, la TVA, un échéancier de paiement et un planning en sprints avant engagement. |

**16. Résumé**

Ce document fournit une vision complète et normative de la plateforme
Najah Partners : concepts et vocabulaire, règles de gestion (BV comme
unité unique, structure binaire à placement explicite, cycle
d'inscription avec réservation de place, e-cards paramétrables, moteur
de commissions hebdomadaire), modèle de données, machines à états,
algorithme de commissions, architecture technique (NestJS, Next.js,
React + shadcn/ui, PostgreSQL), sécurité et démarche. Il est conçu pour
servir de référence unique au développement, par une équipe ou un agent
IA de codage, et pour permettre à la cliente d'évaluer et de valider
chaque décision structurante avant la mise en œuvre.
