/**
 * Libellés français du PORTAIL AFFILIÉ. DICTIONNAIRE PLAT à clés pointées : aucun texte
 * visible n'est écrit en dur dans un composant (CLAUDE.md racine — code en anglais, interface
 * en français). Ajouter l'arabe reviendra à poser un fichier `ar.ts` de mêmes clés et à
 * changer la locale du provider ; aucun composant ne bougera (le sens RTL est déjà porté par
 * `dir` sur <html>, et les composants shadcn sont initialisés en mode RTL).
 *
 * CLÉS DÉDIÉES, JAMAIS RECYCLÉES DEPUIS LE BACK-OFFICE. Le registre n'est pas le même : le
 * back-office parle à un gestionnaire qui connaît le modèle, le portail à un affilié qui ne le
 * connaît pas. « Événements inéligibles » se dit ici « commissions qui ne vous seront pas
 * versées, et pourquoi ». Partager un dictionnaire aurait fait dériver l'un vers l'autre.
 *
 * PÉDAGOGIE : les clés `explain.*` portent les phrases qui expliquent le modèle. Elles sont
 * groupées ici plutôt que dispersées pour qu'on puisse les relire ensemble et vérifier qu'on
 * raconte partout la même chose — notamment sur les deux « débordements », qui sont la source
 * n° 1 de malentendus (les POINTS se reportent, l'ARGENT au-delà du plafond est perdu).
 */
export const fr = {
  "app.name": "Najah Partners",
  "app.subtitle": "Espace affilié",

  // ── Navigation ──
  "nav.dashboard": "Accueil",
  "nav.commissions": "Mes gains",
  "nav.ecards": "Mes e-cards",
  "nav.network": "Mon réseau",
  "nav.shop": "Boutique",
  "nav.orders": "Mes commandes",
  "nav.sponsor": "Parrainer",
  "nav.profile": "Mon profil",
  "nav.more": "Plus",
  "nav.moreTitle": "Tout le portail",
  "nav.label": "Navigation principale",
  "nav.close": "Fermer le menu",

  // ── Thème ──
  "theme.label": "Thème",
  "theme.light": "Clair",
  "theme.dark": "Sombre",
  "theme.system": "Système",

  // ── Unités (D-028) ──
  "unit.dt": "DT",
  "unit.points": "pts",
  "unit.rewardPoints": "Points Fidélité",

  // ── Session ──
  "session.restoring": "Ouverture de votre espace…",
  "session.logout": "Se déconnecter",
  "session.loggedOut": "Vous êtes déconnecté.",

  // ── Connexion ──
  "login.title": "Bienvenue",
  "login.subtitle": "Connectez-vous pour retrouver vos gains et votre réseau.",
  "login.identifier": "E-mail, téléphone ou code membre",
  "login.identifierHint": "Les trois fonctionnent : utilisez celui dont vous vous souvenez.",
  "login.password": "Mot de passe",
  "login.submit": "Se connecter",
  "login.submitting": "Connexion…",
  "login.forgot": "Mot de passe oublié ?",
  "login.error": "Identifiants invalides.",
  "login.back": "Retour à la connexion",

  // ── Mot de passe oublié (D-011 : aucun canal d'envoi n'existe) ──
  "forgot.title": "Mot de passe oublié",
  "forgot.subtitle": "Indiquez votre e-mail, votre téléphone ou votre code membre.",
  "forgot.submit": "Demander une réinitialisation",
  "forgot.done": "Demande enregistrée.",
  "forgot.neutralNotice":
    "Pour protéger les comptes, la réponse est toujours la même, que l’identifiant existe ou non.",
  "forgot.noChannelTitle": "Aucun message ne vous sera envoyé",
  "forgot.noChannel":
    "La plateforme n’envoie ni e-mail ni SMS : ce canal n’existe pas encore. Votre demande est bien enregistrée, mais c’est l’administration qui doit vous transmettre le lien de réinitialisation. Contactez-la directement — nous préférons vous le dire clairement plutôt que vous laisser attendre un message qui n’arrivera pas.",

  // ── Statut du membre ──
  "status.REGISTERED": "Inscrit",
  "status.ACTIVE": "Actif",
  "status.INACTIVE": "Gelé",
  "status.REGISTERED.help":
    "Votre place dans l’arbre est définitive, mais vous ne percevez encore aucune commission : il faut activer votre compte en choisissant un pack.",
  "status.ACTIVE.help": "Votre compte est actif : vous percevez vos commissions normalement.",
  "status.INACTIVE.help":
    "Votre compte est gelé faute de renouvellement. Les points de votre réseau continuent de circuler, mais vous ne percevez plus rien tant que l’administration n’a pas validé votre renouvellement.",

  // ── Vérification d'identité (D-018 — informative, jamais bloquante) ──
  "verification.title": "Vérification d’identité",
  "verification.PENDING": "En cours de vérification",
  "verification.VERIFIED": "Identité vérifiée",
  "verification.REJECTED": "Pièce refusée",
  "verification.nonBlocking":
    "Ce badge est informatif : il ne bloque rien. Vous pouvez vous activer, percevoir vos commissions et renouveler normalement, quel qu’en soit l’état.",
  "verification.rejectedReason": "Motif du refus",
  "verification.documentNumber": "Numéro de pièce",
  "verification.documentType": "Type de pièce",
  "idDocument.ID_CARD": "Carte d’identité nationale",
  "idDocument.DRIVING_LICENSE": "Permis de conduire",
  "idDocument.PASSPORT": "Passeport",

  // ── Tableau de bord (§7.1.1) ──
  "dashboard.title": "Bonjour {name}",
  "dashboard.subtitle": "Voici où en sont vos gains et votre réseau.",
  "dashboard.balance": "Mon solde",
  "dashboard.balanceHint": "Disponible pour créer des e-cards.",
  "dashboard.lifetimeEarned": "Gains cumulés",
  "dashboard.lifetimeEarnedHint": "Total réellement perçu depuis votre inscription.",
  "dashboard.lastRun": "Dernier versement",
  "dashboard.lastRunNone": "Vous n’avez pas encore reçu de versement.",
  "dashboard.lastRunPaid": "Versé",
  "dashboard.lastRunGross": "Dû brut",
  "dashboard.lastRunLost": "Perdu au plafond",
  "dashboard.pending": "En attente du prochain versement",
  "dashboard.pendingHint":
    "{count} commission(s) déjà acquise(s). Ce montant est un dû brut : le plafond hebdomadaire ne s’applique qu’au moment du versement.",
  "dashboard.pendingNone": "Aucune commission en attente pour le moment.",
  "dashboard.nextRun": "Prochain versement",
  "dashboard.nextRunHint": "Les commissions sont versées chaque vendredi soir.",
  "dashboard.legs": "Mes deux jambes",
  "dashboard.legLeft": "Jambe gauche",
  "dashboard.legRight": "Jambe droite",
  "dashboard.legsTotal": "Points reçus depuis toujours",
  "dashboard.carry": "En réserve (report)",
  "dashboard.carryHint": "Points pas encore appariés. Ils ne se perdent jamais.",
  "dashboard.tier": "Mon palier",
  "dashboard.tierHint": "Nombre de points, sur CHAQUE jambe, qui forme un équilibre.",
  "dashboard.balancesCount": "Équilibres atteints",
  "dashboard.balancesCountHint": "Depuis toujours — ce compteur ne repart jamais de zéro.",
  "dashboard.rewardPoints": "Points Fidélité",
  "dashboard.rewardPointsHint": "Un par 6ᵉ équilibre. Ce ne sont ni des points d’arbre, ni des dinars.",
  "dashboard.startupBonus": "Bonus de démarrage",
  "dashboard.startupBonusUsed": "Déjà perçu",
  "dashboard.startupBonusPending": "Pas encore perçu",
  "dashboard.network": "Mon réseau",
  "dashboard.downlines": "Membres dans mon réseau",
  "dashboard.activatedDownlines": "dont activés",
  "dashboard.referrals": "Filleuls parrainés",
  "dashboard.ecards": "Mes e-cards actives",
  "dashboard.ecardsValue": "Valeur immobilisée",
  "dashboard.weeklyCap": "Plafond hebdomadaire",
  "dashboard.pack": "Mon pack",
  "dashboard.noPack": "Aucun pack — compte non activé",
  "dashboard.activateCta": "Activer mon compte",
  "dashboard.renewCta": "Régler mon renouvellement",
  "dashboard.seeCommissions": "Voir le détail de mes gains",

  // ── Rappels d'échéance ──
  "renewal.due": "Renouvellement à échéance le {date}",
  "renewal.dueSoon": "Votre renouvellement arrive à échéance le {date}.",
  "renewal.overdue": "Votre renouvellement était attendu le {date}.",
  "renewal.pendingValidation":
    "Votre renouvellement est payé et attend la validation de l’administration.",
  "renewal.pendingValidationHelp":
    "Tant que cette validation n’a pas eu lieu, rien ne change pour vous : un compte gelé le reste et ne perçoit toujours pas de commissions. Payer n’active pas — c’est l’administration qui valide.",

  // ── PÉDAGOGIE — les phrases qui expliquent le modèle ──
  "explain.balance.title": "Qu’est-ce qu’un équilibre ?",
  "explain.balance.body":
    "Quand vos deux jambes ont chacune reçu autant de points que votre palier, un équilibre est atteint : il vous rapporte une commission. C’est la jambe la plus faible qui commande — accumuler d’un seul côté ne suffit jamais.",
  "explain.carry.title": "Pourquoi mes points sont-ils « en réserve » ?",
  "explain.carry.body":
    "Les points qui n’ont pas encore trouvé leur pendant sur l’autre jambe sont mis en réserve. Ils ne sont JAMAIS perdus et n’ont aucune date limite : ils attendent que l’autre jambe les rattrape.",
  "explain.cap.title": "Pourquoi ma commission a-t-elle été plafonnée ?",
  "explain.cap.body":
    "Chaque pack fixe un plafond de gains par semaine. Une fois ce plafond atteint, le reste de la semaine n’est pas versé — et il n’est pas reporté sur la semaine suivante : il est perdu. À ne pas confondre avec vos points, qui, eux, sont conservés.",
  "explain.twoUnits.title": "Points et dinars ne se convertissent pas",
  "explain.twoUnits.body":
    "Les POINTS mesurent votre réseau : ils composent votre palier et alimentent vos deux jambes. Les DINARS sont votre argent : solde, e-cards, commissions. Il n’existe aucun taux de change entre les deux, dans aucun sens.",
  "explain.direct.title": "Commission directe",
  "explain.direct.body":
    "Vous la percevez quand un filleul que vous avez PARRAINÉ active son compte. Son montant dépend du pack de votre filleul, pas du vôtre.",
  "explain.startup.title": "Bonus de démarrage",
  "explain.startup.body":
    "Une seule fois dans votre vie d’affilié : au moment où votre réseau atteint deux membres activés, vous percevez une commission indirecte supplémentaire.",
  "explain.reward.title": "Points Fidélité",
  "explain.reward.body":
    "Un équilibre sur six ne verse pas d’argent : il vous donne un Point Fidélité. C’est une troisième unité, distincte de vos points de réseau comme de vos dinars.",
  "explain.sponsorVsUpline.title": "Parrain et placement : deux choses différentes",
  "explain.sponsorVsUpline.body":
    "Votre PARRAIN est la personne qui vous a fait connaître Najah Partners : c’est elle qui touche la commission directe de votre activation. Votre UPLINE DE PLACEMENT est le membre sous lequel vous êtes rattaché dans l’arbre, sur une jambe gauche ou droite : c’est lui que vos points alimentent. Les deux sont souvent la même personne — mais pas toujours.",
  "explain.ecardCycle.title": "Comment fonctionne une e-card",
  "explain.ecardCycle.body":
    "Créer une e-card sort immédiatement l’argent de votre solde et le place dans la carte. Vous pouvez la transmettre à qui vous voulez : celui qui détient le code détient la valeur. Si la carte expire ou est révoquée, le montant revient à votre solde. Si elle est utilisée, la valeur quitte définitivement le système en payant.",
  "explain.noPointsOnPurchase.title": "Un achat libre ne rapporte aucun point",
  "explain.noPointsOnPurchase.body":
    "Acheter des produits en dehors d’une activation n’ajoute RIEN à vos jambes et ne fait progresser aucun équilibre. Seule une activation injecte des points dans l’arbre.",

  // ── Mes e-cards (§7.1.3) ──
  "ecards.title": "Mes e-cards",
  "ecards.subtitle": "Créez, suivez et vérifiez vos cartes de valeur.",
  "ecards.create": "Créer une e-card",
  "ecards.verify": "Vérifier un code",
  "ecards.availableBalance": "Solde disponible",
  "ecards.empty": "Vous n’avez encore créé aucune e-card.",
  "ecards.emptyHint": "Une e-card vous permet de transmettre de la valeur à un autre membre.",
  "ecards.value": "Valeur",
  "ecards.status": "État",
  "ecards.createdAt": "Créée le",
  "ecards.usedAt": "Utilisée le",
  "ecards.expiresAt": "Expire le",
  "ecards.closedAt": "Clôturée le",
  "ecards.paidFor": "A servi à payer",
  "ecards.neverExpires": "Sans expiration",
  "ecards.extend": "Prolonger",
  "ecards.extendTitle": "Prolonger l’échéance",
  "ecards.extendDays": "Nombre de jours",
  "ecards.extendHelp":
    "Prolonger ne crée aucune valeur : cela repousse simplement la date à laquelle le montant vous serait remboursé.",
  "ecards.extended": "Échéance repoussée.",
  "ecards.status.ACTIVE": "Active",
  "ecards.status.USED": "Utilisée",
  "ecards.status.EXPIRED": "Expirée",
  "ecards.status.REVOKED": "Révoquée",
  "ecards.origin.MEMBER": "Créée par vous",
  "ecards.origin.GENESIS": "Émise par l’administration",
  "ecards.codeNeverShown": "Les codes ne sont jamais réaffichés",
  "ecards.codeNeverShownHelp":
    "Un code d’e-card vaut de l’argent au porteur : il n’est montré qu’une seule fois, au moment de la création. Passé cet instant, personne ne peut le retrouver — ni vous, ni l’administration.",

  // ── Créer une e-card ──
  "ecardCreate.title": "Créer une e-card",
  "ecardCreate.subtitle": "Le montant sera immédiatement retiré de votre solde.",
  "ecardCreate.amount": "Montant en dinars",
  "ecardCreate.amountHint": "Montant libre, dans la limite de votre solde disponible ({balance}).",
  "ecardCreate.submit": "Créer l’e-card",
  "ecardCreate.submitting": "Création…",
  "ecardCreate.tooHigh": "Ce montant dépasse votre solde disponible.",
  "ecardCreate.tooLow": "Le montant doit être supérieur à zéro.",
  "ecardCreate.tooPrecise": "Trois décimales au maximum (le millime).",
  "ecardCreate.successTitle": "Votre e-card est créée",
  "ecardCreate.codeLabel": "Code de l’e-card",
  "ecardCreate.copy": "Copier le code",
  "ecardCreate.copied": "Code copié.",
  "ecardCreate.warningTitle": "Notez ce code maintenant",
  "ecardCreate.warning":
    "Ce code est de la VALEUR AU PORTEUR : quiconque le détient peut dépenser les {amount}. Il ne sera plus JAMAIS affiché, nulle part. Notez-le ou transmettez-le avant de fermer cette fenêtre.",
  "ecardCreate.done": "J’ai noté le code",

  // ── Vérifier une e-card ──
  "ecardVerify.title": "Vérifier une e-card",
  "ecardVerify.subtitle": "Contrôlez la validité et la valeur d’un code que l’on vous a transmis.",
  "ecardVerify.code": "Code de l’e-card",
  "ecardVerify.submit": "Vérifier",
  "ecardVerify.submitting": "Vérification…",
  "ecardVerify.valid": "Cette e-card est valide.",
  "ecardVerify.invalid": "Cette e-card n’est pas utilisable.",
  "ecardVerify.notFound": "Aucune e-card ne correspond à ce code.",
  "ecardVerify.noConsume": "Cette vérification ne consomme pas la carte.",
  "ecardVerify.reason.EXPIRED": "Elle a dépassé sa date d’expiration.",
  "ecardVerify.reason.USED": "Elle a déjà été utilisée — c’est définitif.",
  "ecardVerify.reason.REVOKED": "Elle a été révoquée par l’administration.",

  // ── Boutique & activation (§7.1.4) ──
  "shop.title": "Boutique",
  "shop.subtitleActivation": "Composez votre pack pour activer votre compte.",
  "shop.subtitleFree": "Commandez vos produits, réglés par e-card.",
  "shop.empty": "Aucun produit disponible pour le moment.",
  "shop.add": "Ajouter",
  "shop.remove": "Retirer",
  "shop.outOfStock": "Épuisé",
  "shop.stockLeft": "{count} en stock",
  "shop.unlimited": "Disponible",
  "shop.promo": "Promotion",
  "shop.cart": "Mon panier",
  "shop.cartEmpty": "Votre panier est vide.",
  "shop.quantity": "Quantité",
  "shop.cartPoints": "Points du panier",
  "shop.cartPrice": "Prix des produits",
  "shop.shipping": "Adresse de livraison",
  // Distinct de l'adresse : c'est le MONTANT, et il ne rentre jamais dans le total dû —
  // la plateforme ne l'encaisse pas, il se règle au livreur.
  "shop.shippingFee": "Frais de livraison",
  "shop.shippingOptional": "Facultatif — utile si votre commande contient des produits à livrer.",
  "shop.shippingOutside":
    "Les frais de livraison sont réglés directement au livreur, en dehors de la plateforme : ils n’entrent pas dans le montant ci-dessous.",
  "shop.checkout": "Payer par e-card",
  "shop.checkingOut": "Paiement…",

  // ── Parcours ACTIVATION ──
  "activation.title": "Activer mon compte",
  "activation.subtitle":
    "Choisissez un pack, composez votre panier au nombre de points exact, puis réglez par e-card.",
  "activation.choosePack": "1. Choisissez votre pack",
  "activation.composeCart": "2. Composez votre panier",
  "activation.pay": "3. Réglez par e-card",
  "activation.packTier": "Palier",
  "activation.packPrice": "Prix du pack",
  "activation.packDirect": "Commission directe",
  "activation.packIndirect": "Par équilibre",
  "activation.packCap": "Plafond hebdomadaire",
  "activation.selectPack": "Choisir ce pack",
  "activation.selectedPack": "Pack choisi",
  "activation.changePack": "Changer de pack",
  "activation.pointsProgress": "Points du panier",
  "activation.pointsRemaining": "Il reste {count} points à atteindre",
  "activation.pointsExceeded": "Vous dépassez le palier de {count} points",
  "activation.pointsExact": "Votre panier atteint exactement le palier.",
  "activation.pointsRule":
    "Le panier doit totaliser EXACTEMENT le palier du pack, ni plus ni moins. C’est ce nombre de points qui sera injecté dans l’arbre de vos parrains.",
  "activation.dueTitle": "Montant à régler",
  "activation.dueBreakdown": "Prix du pack {price} moins votre acompte d’inscription {deposit}",
  "activation.depositExplain":
    "Les 100 DT versés à votre inscription ne sont pas perdus : ils sont déduits du prix de votre pack. C’est un acompte.",
  "activation.success": "Votre compte est activé.",
  "activation.successBody":
    "Les points de votre palier viennent d’être ajoutés aux jambes de vos parrains, et vos premières commissions sont en route.",
  "activation.alreadyActive": "Votre compte est déjà activé.",

  // ── Parcours ACHAT LIBRE ──
  "free.title": "Acheter des produits",
  "free.dueTitle": "Montant à régler",
  "free.dueHint": "Somme des prix des produits de votre panier.",
  "free.success": "Votre commande est enregistrée.",
  "free.requiresActive":
    "L’achat libre est réservé aux comptes activés. Activez d’abord votre compte en choisissant un pack.",

  // ── Paiement par e-cards (commun) ──
  "payment.title": "Paiement par e-card",
  "payment.addCode": "Ajouter un code",
  "payment.codePlaceholder": "XXX-XXX-XXX-XXX",
  "payment.codes": "Codes saisis",
  "payment.remove": "Retirer ce code",
  "payment.due": "Montant dû",
  "payment.covered": "Total de vos cartes",
  "payment.missing": "Il manque {amount}",
  "payment.excess": "Vous dépassez de {amount}",
  "payment.exact": "Le compte est exact.",
  "payment.exactRule":
    "Vous pouvez cumuler plusieurs e-cards, mais leur somme doit couvrir le montant EXACTEMENT : ni trop, ni trop peu. Aucune monnaie n’est rendue.",
  "payment.maxCards": "Dix e-cards au maximum par paiement.",
  "payment.duplicate": "Ce code est déjà dans la liste.",
  "payment.verifyFirst": "Vérifier ce code",
  "payment.unverified": "Valeur inconnue tant que le code n’est pas vérifié.",
  "payment.noGateway":
    "Aucun paiement en ligne n’existe sur la plateforme : tout se règle par e-card.",

  // ── Mes commandes ──
  "orders.title": "Mes commandes",
  "orders.subtitle": "Ce que vous avez commandé et où en est la livraison.",
  "orders.empty": "Vous n’avez encore passé aucune commande.",
  "orders.number": "Commande n° {id}",
  "orders.date": "Date",
  "orders.total": "Montant réglé",
  "orders.points": "Points du panier",
  "orders.context.ACTIVATION": "Activation de compte",
  "orders.context.FREE": "Achat libre",
  "orders.status.PAID": "Payée",
  "orders.shipment": "Livraison",
  "orders.shipment.PREPARATION": "En préparation",
  "orders.shipment.SHIPPED": "Expédiée",
  "orders.shipment.DELIVERED": "Livrée",
  "orders.shipmentNone": "Rien à livrer (produits numériques)",
  "orders.lines": "Produits commandés",
  "orders.unitPrice": "Prix unitaire",
  "orders.unitPoints": "Points unitaires",
  "orders.quantity": "Qté",
  "orders.ecards": "Réglée par {count} e-card(s)",
  "orders.ecardsIds": "Références internes : {ids}",
  "orders.snapshotNote":
    "Les prix et les points affichés sont ceux du jour de la commande : revaloriser un produit ne réécrit jamais une commande passée.",
  "orders.back": "Retour aux commandes",

  // ── Mon réseau (§7.1.5 / §7.1.6) ──
  "network.title": "Mon réseau",
  "network.subtitle": "Votre position, vos deux jambes et les membres qui les composent.",
  "network.tabTree": "Mon arbre",
  "network.tabDownlines": "Mes downlines",
  "network.me": "Vous",
  "network.emptyLeft": "Jambe gauche libre",
  "network.emptyRight": "Jambe droite libre",
  "network.emptyLeg": "Position libre",
  "network.focus": "Recentrer sur ce membre",
  "network.backToMe": "Revenir à ma position",
  "network.boundedNotice":
    "L’arbre est affiché sur deux niveaux à la fois. Descendez de proche en proche : c’est plus rapide que de charger un réseau entier.",
  "network.legLeft": "Jambe gauche",
  "network.legRight": "Jambe droite",
  "network.pointsLeft": "Points reçus à gauche",
  "network.pointsRight": "Points reçus à droite",
  "network.depth": "Niveau {depth}",
  "network.directReferral": "Votre filleul",
  "network.sponsor": "Votre parrain",
  "network.upline": "Votre upline de placement",
  "network.uplineLeg": "Vous êtes sa jambe {leg}",
  "network.noSponsor": "Aucun parrain enregistré",
  "network.noUpline": "Vous êtes à la racine de votre arbre",

  // ── Liste des downlines ──
  "downlines.title": "Les membres de mon réseau",
  "downlines.search": "Rechercher un nom ou un code",
  "downlines.filterStatus": "État",
  "downlines.filterLeg": "Jambe",
  "downlines.filterAll": "Tous",
  "downlines.directOnly": "Mes filleuls uniquement",
  "downlines.empty": "Aucun membre ne correspond à cette recherche.",
  "downlines.emptyAll": "Votre réseau est encore vide. Parrainez votre premier filleul !",
  "downlines.member": "Membre",
  "downlines.pack": "Pack",
  "downlines.activatedAt": "Activé le",
  "downlines.notActivated": "Pas encore activé",
  "downlines.contributed": "Points apportés",
  "downlines.contributedHint":
    "Le palier de son pack, ajouté à votre jambe le jour de son activation. Un membre non activé n’apporte aucun point.",
  "downlines.count": "{count} membre(s)",

  // ── Mes gains (commissions) ──
  "commissions.title": "Mes gains",
  "commissions.subtitle": "Semaine par semaine : ce que vous avez gagné, et pourquoi.",
  "commissions.empty": "Vous n’avez pas encore reçu de versement.",
  "commissions.emptyHint":
    "Vos commissions sont versées chaque vendredi soir. Elles apparaîtront ici dès le premier versement.",
  "commissions.lifetimePaid": "Total perçu",
  "commissions.lifetimeLost": "Total perdu au plafond",
  "commissions.week": "Semaine close le {date}",
  "commissions.gross": "Dû brut",
  "commissions.paid": "Versé",
  "commissions.lost": "Perdu au plafond",
  "commissions.cap": "Plafond appliqué",
  "commissions.events": "{count} commission(s)",
  "commissions.direct": "{count} directe(s)",
  "commissions.balance": "{count} équilibre(s)",
  "commissions.startup": "Bonus de démarrage",
  "commissions.rewardGranted": "{count} Point(s) Fidélité obtenu(s)",
  "commissions.rewardLost": "{count} Point(s) Fidélité perdu(s) au plafond",
  "commissions.detail": "Voir le détail",
  "commissions.capped": "Plafond atteint cette semaine",
  "commissions.cappedHint":
    "Vos gains ont dépassé votre plafond hebdomadaire : la différence n’a pas été versée et n’est pas reportée.",

  // ── Détail d'une semaine ──
  "commissionDetail.title": "Détail de la semaine",
  "commissionDetail.back": "Retour à mes gains",
  "commissionDetail.chronology": "Dans l’ordre où les commissions ont été acquises",
  "commissionDetail.chronologyHint":
    "Le plafond s’applique dans cet ordre exact : les premières commissions de la semaine sont versées en priorité.",
  "commissionDetail.type": "Origine",
  "commissionDetail.amount": "Montant",
  "commissionDetail.cumulative": "Cumul avant",
  "commissionDetail.paid": "Versé",
  "commissionDetail.lost": "Perdu",
  "commissionDetail.from": "Grâce à",
  "commissionDetail.crossesCap": "C’est ici que votre plafond a été atteint",
  "commissionDetail.crossesCapHint":
    "Cette commission a été versée PARTIELLEMENT : la part au-delà du plafond, et tout ce qui suit dans la semaine, n’a pas été versé.",
  "commissionDetail.rewardGranted": "Point Fidélité obtenu",
  "commissionDetail.rewardLost": "Point Fidélité perdu (survenu après le plafond)",
  "commissionDetail.ineligible": "Non versée",
  "commissionDetail.ineligibleHint":
    "Votre compte n’était pas actif au moment où cette commission est née : elle est tracée, mais ne sera jamais versée.",
  "commissionDetail.balanceIndex": "Équilibre n° {index}",
  "eventType.DIRECT": "Commission directe",
  "eventType.BALANCE": "Équilibre",
  "eventType.STARTUP_BONUS": "Bonus de démarrage",
  "eventType.REWARD_POINT": "Point Fidélité",

  // ── Mouvements de solde ──
  "ledger.title": "Mouvements de mon solde",
  "ledger.subtitle": "Chaque entrée et chaque sortie de votre portefeuille en dinars.",
  "ledger.empty": "Aucun mouvement pour le moment.",
  "ledger.date": "Date",
  "ledger.type": "Nature",
  "ledger.amount": "Montant",
  "ledger.balanceAfter": "Solde après",
  "ledger.reason": "Motif",
  "ledger.ecardNote":
    "Utiliser une e-card pour payer n’apparaît pas ici : aucun solde ne bouge à ce moment-là. Seules la création d’une e-card (qui débite) et son remboursement (qui recrédite) laissent une trace.",
  "ledger.type.COMMISSION": "Commission versée",
  "ledger.type.ECARD_CREATION": "Création d’e-card",
  "ledger.type.ECARD_REFUND": "Remboursement d’e-card",
  "ledger.type.ACTIVATION": "Activation",
  "ledger.type.ADMIN_ADJUSTMENT": "Ajustement de l’administration",
  "ledger.type.GENESIS": "Dotation initiale",

  // ── Parrainer (§7.1.2) ──
  "sponsor.title": "Parrainer un filleul",
  "sponsor.subtitle": "Transmettez votre code : c’est lui qui vous rattache votre filleul.",
  "sponsor.myCode": "Mon code de parrainage",
  "sponsor.copy": "Copier mon code",
  "sponsor.copied": "Code copié.",
  "sponsor.howTitle": "Comment ça se passe",
  "sponsor.step1": "Transmettez votre code membre à votre futur filleul.",
  "sponsor.step2":
    "C’est LUI qui remplit le formulaire d’inscription : vous ne pouvez pas le faire à sa place. Il y saisira votre code comme code parrain.",
  "sponsor.step3":
    "Il devra régler 100 DT de frais d’inscription par e-card. Vous pouvez lui en créer une depuis « Mes e-cards ».",
  "sponsor.step4":
    "Il choisit ensuite sous quel membre et sur quelle jambe se placer, dans votre réseau. Cette position est définitive.",
  "sponsor.step5":
    "Quand il activera son compte en achetant un pack, vous percevrez votre commission directe.",
  "sponsor.noLinkTitle": "Pas de lien de parrainage",
  "sponsor.noLink":
    "Il n’existe pas encore de lien d’inscription pré-rempli : transmettez simplement votre code, votre filleul le saisira lui-même.",
  "sponsor.createEcard": "Créer une e-card de 100 DT",

  // ── Mon profil (§7.1.7) ──
  "profile.title": "Mon profil",
  "profile.subtitle": "Vos informations, votre sécurité et votre renouvellement.",
  "profile.tabInfo": "Informations",
  "profile.tabSecurity": "Sécurité",
  "profile.tabRenewal": "Renouvellement",
  "profile.identity": "Identité",
  "profile.firstName": "Prénom",
  "profile.lastName": "Nom",
  "profile.email": "Adresse e-mail",
  "profile.phone": "Téléphone",
  "profile.memberCode": "Code membre",
  "profile.registeredAt": "Inscrit le",
  "profile.activatedAt": "Activé le",
  "profile.save": "Enregistrer",
  "profile.saving": "Enregistrement…",
  "profile.saved": "Vos informations sont à jour.",
  "profile.loginIdsTitle": "E-mail et téléphone : nous contacter pour les modifier",
  "profile.loginIdsLocked":
    "Votre e-mail et votre téléphone servent à vous connecter. Comme la plateforme n’envoie aucun message de confirmation, une erreur de saisie vous priverait de l’accès à votre compte sans moyen de le récupérer. Leur modification passe donc par l’administration.",
  "profile.noBankData":
    "Aucune donnée bancaire n’est demandée ni conservée : la plateforme ne fait ni virement ni prélèvement.",
  "profile.position": "Ma position",
  "profile.registrationPaid": "Acompte versé à l’inscription",
  "profile.registrationPaidHint": "Déduit du prix de votre pack au moment de l’activation.",

  // ── Sécurité ──
  "password.title": "Changer mon mot de passe",
  "password.current": "Mot de passe actuel",
  "password.new": "Nouveau mot de passe",
  "password.confirm": "Confirmer le nouveau mot de passe",
  "password.submit": "Changer mon mot de passe",
  "password.submitting": "Modification…",
  "password.mismatch": "Les deux mots de passe ne correspondent pas.",
  "password.tooShort": "Huit caractères au minimum.",
  "password.wrongCurrent": "Mot de passe actuel incorrect.",
  "password.success": "Mot de passe modifié. Reconnectez-vous.",
  "password.logoutNotice":
    "Pour votre sécurité, changer votre mot de passe ferme toutes vos sessions : vous devrez vous reconnecter juste après.",

  // ── Renouvellement (§5.9, D-038) ──
  "renewalTab.title": "Renouvellement annuel",
  "renewalTab.dueDate": "Échéance",
  "renewalTab.noDueDate": "Aucune échéance — votre compte n’a jamais été activé.",
  "renewalTab.amount": "Montant",
  "renewalTab.pay": "Régler par e-card",
  "renewalTab.paying": "Paiement…",
  "renewalTab.paid": "Paiement enregistré. Il attend maintenant la validation de l’administration.",
  "renewalTab.twoSteps": "Deux étapes, et la seconde ne vous appartient pas",
  "renewalTab.twoStepsBody":
    "Vous réglez d’abord par e-card. Votre compte ne change PAS d’état à ce moment-là : c’est l’administration qui valide ensuite, et c’est cette validation qui réactive un compte gelé. Un paiement en attente ne vous rend donc aucun droit.",
  "renewalTab.history": "Mes renouvellements",
  "renewalTab.historyEmpty": "Aucun renouvellement enregistré.",
  "renewalTab.status.PENDING_VALIDATION": "En attente de validation",
  "renewalTab.status.VALIDATED": "Validé",
  // SETTLED ne concerne que le paiement d'INSCRIPTION (acquis, définitif) : il n'apparaît
  // jamais dans la file des renouvellements, mais l'énumération le porte — et le type nous
  // oblige à le traiter, ce qui est exactement le service attendu du contrat généré.
  "renewalTab.status.SETTLED": "Réglé",
  "renewalTab.paidAt": "Payé le",
  "renewalTab.validatedAt": "Validé le",
  "renewalTab.alreadyPending":
    "Un paiement est déjà en attente de validation : inutile d’en régler un second, il brûlerait des e-cards pour rien.",
  "renewalTab.notRegistered":
    "Le renouvellement ne concerne que les comptes activés. Activez d’abord votre compte.",

  // ── États transverses ──
  "state.loading": "Chargement…",
  "state.error": "Impossible d’afficher ces informations.",
  "state.retry": "Réessayer",
  "state.empty": "Rien à afficher pour le moment.",
  "state.notFound": "Page introuvable",
  "state.notFoundHint": "Le lien que vous avez suivi ne mène nulle part.",
  "state.backHome": "Retour à l’accueil",
  "state.crashTitle": "Un problème est survenu",
  "state.crashBody": "L’écran n’a pas pu s’afficher. Rechargez la page pour reprendre.",
  "state.reload": "Recharger",

  // ── Actions communes ──
  "action.cancel": "Annuler",
  "action.close": "Fermer",
  "action.confirm": "Confirmer",
  "action.previous": "Précédent",
  "action.next": "Suivant",
  "action.page": "Page {page} sur {pages}",
  "action.copy": "Copier",
  "action.copied": "Copié.",
  "action.copyFailed": "La copie a échoué : sélectionnez le texte manuellement.",
  "action.showMore": "Afficher plus",
  "action.showLess": "Afficher moins",
} as const

export type Dictionary = typeof fr
export type TranslationKey = keyof Dictionary
