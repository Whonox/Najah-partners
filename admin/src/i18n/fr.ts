/**
 * Libellés français du back-office. DICTIONNAIRE PLAT à clés pointées : aucun texte visible
 * n'est écrit en dur dans un composant (CLAUDE.md racine — code en anglais, interface en
 * français). Ajouter l'arabe reviendra à poser un fichier `ar.ts` de mêmes clés et à changer
 * la locale du provider ; aucun composant ne bougera (le sens RTL est déjà porté par
 * `dir` sur <html>, et les composants shadcn sont initialisés en mode RTL).
 *
 * Rien n'est traduit à ce stade — la structure seule est en place.
 */
export const fr = {
  "app.name": "Najah Partners",
  "app.subtitle": "Back-office",

  // ── Navigation (les 12 modules de la spec §7.2) ──
  "nav.dashboard": "Tableau de bord",
  "nav.members": "Membres",
  "nav.genealogy": "Généalogie",
  "nav.packs": "Packs",
  "nav.products": "Produits",
  "nav.orders": "Commandes",
  "nav.commissions": "Commissions",
  "nav.ledger": "Soldes & mouvements",
  "nav.ecards": "E-cards",
  "nav.reports": "Rapports",
  "nav.settings": "Paramètres",
  "nav.adminUsers": "Comptes admin",
  "nav.open": "Ouvrir la navigation",
  "nav.close": "Fermer la navigation",
  "nav.label": "Navigation principale",

  // ── Rôles (RBAC, D-017b) ──
  "role.SUPER_ADMIN": "Super-admin",
  "role.MANAGER": "Gestionnaire",
  "role.SUPPORT": "Support",

  // ── Thème ──
  "theme.label": "Thème",
  "theme.light": "Clair",
  "theme.dark": "Sombre",
  "theme.system": "Système",

  // ── Connexion ──
  "login.title": "Connexion au back-office",
  "login.subtitle": "Espace réservé aux administrateurs Najah Partners.",
  "login.email": "Adresse e-mail",
  "login.password": "Mot de passe",
  "login.submit": "Se connecter",
  "login.pending": "Connexion…",
  "login.failed": "Identifiants invalides.",
  "login.expired": "Session expirée, merci de vous reconnecter.",

  // ── Session ──
  "session.restoring": "Restauration de la session…",
  "session.logout": "Se déconnecter",
  "session.account": "Compte",

  // ── États génériques (chargement / erreur / vide) ──
  "state.loading": "Chargement…",
  "state.errorTitle": "Impossible d’afficher ces données",
  "state.errorRetry": "Réessayer",
  "state.empty": "Aucune donnée à afficher.",
  "state.forbiddenTitle": "Accès refusé",
  "state.forbiddenBody":
    "Votre rôle ne permet pas d’accéder à ce module. Rapprochez-vous d’un super-admin.",
  /* Filet de sécurité d'ÉCRAN : une carte qui tombe ne doit jamais emporter l'application
     entière (sidebar comprise). Le message reste sobre — l'admin n'a pas à lire une pile
     d'appels, il a besoin de savoir que le reste du back-office fonctionne encore. */
  "state.crashTitle": "Cet écran n’a pas pu s’afficher",
  "state.crashBody":
    "Une donnée inattendue a interrompu l’affichage. La navigation reste utilisable : vous pouvez réessayer ou changer de module.",
  "state.crashRetry": "Réafficher l’écran",
  "state.notFoundTitle": "Page introuvable",
  "state.notFoundBody": "Cette adresse ne correspond à aucun écran du back-office.",
  "state.backToDashboard": "Retour au tableau de bord",

  // ── Module non encore construit ──
  "comingSoon.badge": "À venir",
  "comingSoon.body":
    "Ce module sera construit dans une tranche ultérieure. La navigation est déjà en place.",

  // ── Unités (D-028 : deux dimensions qui ne se croisent jamais) ──
  "unit.dt": "DT",
  "unit.points": "pts",

  // ── Paramètres système (spec §7.2.11) ──
  "settings.title": "Paramètres système",
  "settings.description":
    "Valeurs de référence lues par le backend. Une modification ne réécrit jamais l’historique : elle ne vaut que pour les transactions à venir.",
  "settings.column.key": "Clé",
  "settings.column.description": "Description",
  "settings.column.value": "Valeur",
  "settings.column.actions": "",
  "settings.edit": "Modifier",
  "settings.save": "Enregistrer",
  "settings.cancel": "Annuler",
  "settings.saving": "Enregistrement…",
  "settings.saved": "Paramètre enregistré.",
  "settings.saveFailed": "Enregistrement impossible.",
  "settings.readOnly":
    "Lecture seule : seul un super-admin peut modifier un paramètre système.",
  "settings.valueLabel": "Nouvelle valeur",
  "settings.noDescription": "—",
  "settings.column.label": "Paramètre",

  /* Libellé lisible de chaque clé. Il vit ICI et non en base parce que c'est du texte
     d'INTERFACE : le jour où l'arabe arrive, un `ar.ts` le traduit sans migration, là où une
     colonne `label` figerait le français dans les données. Une clé sans libellé retombe sur
     la clé elle-même — jamais un écran vide. */
  "settings.label.ecard_expiration_days": "Validité des e-cards",
  "settings.label.registration_fee_dt": "Frais d’inscription",
  "settings.label.annual_renewal_dt": "Renouvellement annuel",
  "settings.label.commission_cron_day": "Jour de clôture des commissions",
  "settings.label.commission_cron_time": "Heure de clôture des commissions",
  "settings.label.commission_timezone": "Fuseau horaire des commissions",
  "settings.label.member_code_prefix": "Préfixe des codes membres",
  "settings.label.currency": "Devise",

  // ── Vocabulaire commun aux tables et aux formulaires ──
  "common.active": "Actif",
  "common.inactive": "Inactif",
  "common.yes": "Oui",
  "common.no": "Non",
  "common.all": "Tous",
  "common.none": "—",
  "common.save": "Enregistrer",
  "common.saving": "Enregistrement…",
  "common.cancel": "Annuler",
  "common.create": "Créer",
  "common.edit": "Modifier",
  "common.delete": "Supprimer",
  "common.close": "Fermer",
  "common.search": "Rechercher",
  "common.searchPlaceholder": "Code, nom, e-mail…",
  "common.reset": "Réinitialiser",
  "common.back": "Retour",
  "common.saved": "Enregistré.",
  "common.saveFailed": "Enregistrement impossible.",
  "common.required": "Ce champ est obligatoire.",
  "common.readOnlyRole":
    "Lecture seule : votre rôle ne permet pas de modifier ces données.",

  // ── Tables (pagination, tri) ──
  "table.sortBy": "Trier sur cette colonne",
  "table.previous": "Précédent",
  "table.next": "Suivant",
  "table.rangeStart": "Résultats",
  "table.rangeOf": "sur",
  "table.rowsFiltered": "Filtres appliqués",

  // ── États d'adhésion (§5.9 — INACTIF = gel de non-renouvellement, D-034) ──
  "memberStatus.REGISTERED": "Inscrit",
  "memberStatus.ACTIVE": "Actif",
  "memberStatus.INACTIVE": "Inactif",

  // ── Vérification d'identité (D-018) — informative, jamais bloquante ──
  "verification.PENDING": "À vérifier",
  "verification.VERIFIED": "Vérifiée",
  "verification.REJECTED": "Refusée",
  "idDocument.ID_CARD": "Carte d’identité",
  "idDocument.DRIVING_LICENSE": "Permis de conduire",
  "idDocument.PASSPORT": "Passeport",

  // ── Membres (§7.2.2) ──
  "members.title": "Membres",
  "members.description":
    "Consultation du réseau. Le placement est immuable et l’activation passe par la boutique : aucun écran ne les modifie.",
  "members.column.code": "Code",
  "members.column.name": "Nom",
  "members.column.status": "Statut",
  "members.column.pack": "Pack",
  "members.column.balance": "Solde",
  "members.column.downlines": "Downlines G / D",
  "members.column.registeredAt": "Inscrit le",
  "members.column.activatedAt": "Activé le",
  "members.column.verification": "Identité",
  "members.filter.status": "Statut",
  "members.filter.pack": "Pack",
  "members.filter.verification": "Identité",
  /* Option « pas de filtre ». Le libellé est propre à chaque liste : un « Tous » générique
     se lit mal en français (« Tous » pour des catégories, « Toutes » pour des expéditions) et
     surtout, il doit REMPLACER à l'écran la valeur technique du filtre vide. */
  "members.filter.statusAll": "Tous les statuts",
  "members.filter.packAll": "Tous les packs",
  "members.filter.verificationAll": "Toutes les identités",
  "members.filter.from": "Inscrit à partir du",
  "members.filter.to": "Inscrit jusqu’au",
  "members.legLeft": "G",
  "members.legRight": "D",
  "members.legFree": "libre",
  "members.notFound": "Ce membre n’existe pas.",

  // ── Fiche membre ──
  "member.tab.identity": "Identité",
  "member.tab.tree": "Position dans l’arbre",
  "member.tab.ledger": "Mouvements de solde",
  "member.section.contact": "Coordonnées",
  "member.section.idDocument": "Pièce d’identité",
  "member.section.pack": "Pack et snapshot d’activation",
  "member.section.position": "Position",
  "member.section.points": "Points par jambe",
  "member.section.engine": "Compteurs du moteur de commissions",
  "member.field.email": "E-mail",
  "member.field.phone": "Téléphone",
  "member.field.registeredAt": "Inscription",
  "member.field.activatedAt": "Activation",
  "member.field.renewalAt": "Échéance de renouvellement",
  "member.field.idType": "Type de pièce",
  "member.field.idNumber": "Numéro saisi",
  /* Libellé du champ, distinct de l'état « À vérifier » qu'il porte : afficher
     « À vérifier : [À vérifier] » ne disait pas de quoi il s'agissait. */
  "member.field.verification": "Vérification d’identité",
  "member.field.sponsor": "Sponsor (parrain)",
  "member.field.upline": "Upline de placement",
  "member.field.leg": "Jambe occupée",
  "member.field.leftDownline": "Downline gauche",
  "member.field.rightDownline": "Downline droite",
  "member.field.leftPoints": "Jambe gauche (cumul à vie)",
  "member.field.rightPoints": "Jambe droite (cumul à vie)",
  "member.field.baseline": "Baseline (figée à l’activation)",
  "member.field.carried": "Carry-over (pool appariable)",
  "member.field.balance": "Solde",
  "member.field.registrationPaid": "Acompte d’inscription versé",
  "member.field.pack": "Pack",
  "member.field.tier": "Palier injecté dans l’arbre",
  "member.field.lifetimeBalances": "Équilibres à vie",
  "member.field.startupBonus": "Bonus de démarrage",
  "member.field.rewardPoints": "Points Fidélité",
  "member.field.activatedDescendants": "Membres activés dans le sous-arbre",
  "member.hint.sponsorVsUpline":
    "Deux liens DISTINCTS : le sponsor déclenche la commission directe, l’upline de placement détermine la position binaire. Ils peuvent désigner des membres différents.",
  "member.hint.points":
    "Le cumul à vie monte à chaque activation du sous-arbre, quel que soit l’état du membre. Le carry-over est ce qui reste appariable : il n’expire jamais.",
  "member.hint.snapshot":
    "Valeurs FIGÉES au moment de l’activation. Modifier le pack aujourd’hui ne les réécrit pas.",
  "member.hint.identity":
    "Vérification informative : elle ne bloque ni l’inscription, ni l’activation, ni les commissions.",
  "member.hint.rewardPoints":
    "Troisième unité, distincte des points et des dinars : 1 par 6ᵉ équilibre à vie.",
  "member.idDocument.show": "Afficher la pièce",
  "member.idDocument.hide": "Masquer la pièce",
  "member.idDocument.none": "Aucune pièce déposée.",
  "member.idDocument.failed": "Pièce illisible ou introuvable.",
  "member.idDocument.pdf": "Ouvrir le document (PDF)",
  "member.idDocument.alt": "Pièce d’identité du membre",
  "member.action.genealogy": "Voir dans l’arbre",
  "member.action.orders": "Ses commandes",
  "member.action.adjustBalance": "Ajuster le solde",
  "member.action.adjustHint":
    "L’ajustement manuel de solde relève du module Soldes & mouvements (motif obligatoire, tracé). Il n’est pas dupliqué ici.",
  "member.blockedUnavailable":
    "Le blocage d’un membre n’est pas implémenté : la règle n’est pas tranchée (à ne pas confondre avec l’état INACTIF, qui est le gel de non-renouvellement).",
  "member.ledger.empty":
    "Aucun mouvement de solde. C’est normal : payer par e-card n’écrit rien au grand livre — aucun solde ne bouge.",
  "member.ledger.column.date": "Date",
  "member.ledger.column.type": "Type",
  "member.ledger.column.amount": "Montant",
  "member.ledger.column.balanceAfter": "Solde après",
  "member.ledger.column.reason": "Motif",

  // ── Types de mouvement du grand livre ──
  "ledgerType.ECARD_CREATION": "Émission d’e-card",
  "ledgerType.ECARD_REFUND": "Remboursement d’e-card",
  "ledgerType.COMMISSION": "Commission",
  "ledgerType.ACTIVATION": "Activation",
  "ledgerType.ADMIN_ADJUSTMENT": "Ajustement admin",
  "ledgerType.ADMIN_GENESIS": "Genèse admin",

  // ── Généalogie (§7.2.3) ──
  "genealogy.title": "Généalogie du réseau",
  "genealogy.description":
    "Arbre binaire consulté par niveaux : seuls les nœuds affichés sont chargés. Cliquez un membre pour recentrer l’arbre sur lui.",
  "genealogy.search": "Recentrer sur un code membre",
  "genealogy.searchPlaceholder": "NP000042",
  "genealogy.searchSubmit": "Recentrer",
  "genealogy.notFound": "Aucun membre ne porte ce code.",
  "genealogy.rootPrompt":
    "Recherchez un code membre, ou ouvrez un membre depuis la liste, pour afficher son sous-arbre.",
  "genealogy.up": "Remonter à l’upline",
  "genealogy.upNone":
    "Ce membre est la racine de l’arbre : il n’a pas d’upline de placement.",
  "genealogy.descend": "Descendre sur ce membre",
  /* `{code}` est remplacé par le code du membre : chaque carte annonce SA propre action,
     sinon un lecteur d'écran énonce sept fois « Recentrer l'arbre ». */
  "genealogy.recenterOn": "Recentrer l’arbre sur {code}",
  "genealogy.recenter": "Recentrer",
  "genealogy.openMember": "Ouvrir la fiche",
  "genealogy.free": "Position libre",
  "genealogy.legLeft": "Jambe gauche",
  "genealogy.legRight": "Jambe droite",
  "genealogy.moreBelow": "D’autres membres se trouvent en dessous.",
  "genealogy.path": "Chemin parcouru",
  "genealogy.reset": "Revenir au départ",

  // ── Packs (§7.2.4) ──
  "packs.title": "Packs",
  "packs.description":
    "Paliers et plan de rémunération. Un pack ne se supprime jamais : on le désactive.",
  /* Titre PROPRE à l'avertissement de snapshot : il empruntait « État » à l'en-tête de
     colonne des packs, qui ne dit rien de ce que l'encart annonce. */
  "packs.warningTitle": "Modifier un pack ne réécrit jamais le passé",
  "packs.warning":
    "Modifier un pack n’affecte que les activations À VENIR. Les membres déjà activés conservent le snapshot figé au jour de leur activation — l’historique et les commissions passées restent intacts.",
  "packs.new": "Nouveau pack",
  "packs.edit": "Modifier le pack",
  "packs.column.name": "Nom",
  "packs.column.tier": "Palier",
  "packs.column.price": "Prix",
  "packs.column.direct": "Comm. directe",
  "packs.column.indirect": "Comm. indirecte",
  "packs.column.cap": "Plafond hebdo",
  "packs.column.members": "Membres",
  "packs.column.status": "État",
  "packs.field.name": "Nom",
  "packs.field.tier": "Palier (points)",
  "packs.field.price": "Prix (DT)",
  "packs.field.direct": "Commission directe (DT)",
  "packs.field.indirect": "Commission indirecte par équilibre (DT)",
  "packs.field.cap": "Plafond hebdomadaire (DT)",
  "packs.field.active": "Pack proposé à l’activation",
  "packs.hint.tier":
    "En POINTS : total exact que le panier doit atteindre à l’activation, et points injectés dans l’arbre. Sans valeur monétaire.",
  "packs.hint.price":
    "En DINARS. L’acompte d’inscription déjà versé en est déduit au moment de l’activation.",
  "packs.hint.cap":
    "En DINARS. Au-delà du plafond, la commission de la semaine est PERDUE — jamais reportée.",
  "packs.hint.noDelete":
    "Désactiver retire le pack du choix d’activation sans toucher aux membres qui l’ont déjà pris.",
  "packs.error.positive": "La valeur doit être strictement positive.",
  "packs.error.capBelowCommission":
    "Le plafond hebdomadaire doit être au moins égal à chacune des deux commissions.",
  "packs.error.millime": "Trois décimales au maximum (le millime).",
  "packs.error.integer": "Un palier est un nombre entier de points.",
  "packs.membersHint": "membre(s) activé(s) sur ce pack",
  "packs.readOnly":
    "Lecture seule : seul un super-admin peut créer ou modifier un pack (il en définit les commissions).",

  // ── Produits (§7.2.5) ──
  "products.title": "Produits",
  "products.description":
    "Catalogue complet, produits inactifs et masqués compris. Un produit ne se supprime pas : il se désactive.",
  "products.hint.twoUnits":
    "La valeur en POINTS sert à composer le palier d’un pack à l’activation. Une promotion baisse le prix en DINARS sans jamais toucher aux points.",
  "products.new": "Nouveau produit",
  "products.edit": "Modifier le produit",
  "products.tab.products": "Produits",
  "products.tab.categories": "Catégories",
  "products.column.name": "Nom",
  "products.column.category": "Catégorie",
  "products.column.price": "Prix",
  "products.column.promo": "Promo",
  "products.column.points": "Points",
  "products.column.type": "Type",
  "products.column.stock": "Stock",
  "products.column.shipping": "Livraison",
  "products.column.status": "État",
  "products.column.visible": "Vitrine",
  "products.field.name": "Nom",
  "products.field.description": "Description",
  "products.field.category": "Catégorie",
  "products.field.price": "Prix (DT)",
  "products.field.promo": "Prix promotionnel (DT)",
  "products.field.points": "Valeur en points (BV)",
  "products.field.type": "Type",
  "products.field.stock": "Stock",
  "products.field.shipping": "Frais de livraison (DT)",
  "products.field.active": "Achetable",
  "products.field.visible": "Visible sur la vitrine",
  "products.hint.stock":
    "Obligatoire pour un produit PHYSIQUE (0 = rupture). Un produit VIRTUEL est illimité : le champ disparaît.",
  "products.hint.shipping":
    "Affichés puis réglés hors système : ils n’entrent dans aucun montant dû à la plateforme.",
  "products.hint.promo":
    "Prix effectif s’il existe. La valeur en points ne change pas.",
  "products.type.PHYSICAL": "Physique",
  "products.type.VIRTUAL": "Virtuel",
  "products.stockUnlimited": "Illimité",
  "products.filter.category": "Catégorie",
  "products.filter.categoryAll": "Toutes les catégories",
  "products.error.promoAbovePrice":
    "Le prix promotionnel doit être inférieur ou égal au prix.",
  "products.error.stockRequired":
    "Un produit physique exige un stock (0 pour une rupture).",
  "products.readOnly":
    "Lecture seule : votre rôle ne permet pas de modifier le catalogue.",

  // ── Catégories ──
  "categories.new": "Nouvelle catégorie",
  "categories.edit": "Modifier la catégorie",
  "categories.column.name": "Nom",
  "categories.column.description": "Description",
  "categories.column.sortOrder": "Ordre",
  "categories.column.products": "Produits",
  "categories.field.name": "Nom",
  "categories.field.description": "Description",
  "categories.field.sortOrder": "Ordre d’affichage",
  "categories.deleteTitle": "Supprimer cette catégorie ?",
  "categories.deleteBody":
    "Seule une catégorie VIDE peut être supprimée. Si elle contient des produits, l’opération sera refusée.",
  "categories.deleted": "Catégorie supprimée.",
  /* Phrase propre à la boîte de dialogue : elle reprenait le libellé de l'onglet
     (« Catégories »), qui ne décrit pas ce que le formulaire attend. */
  "categories.dialogHint":
    "Une catégorie regroupe des produits dans la boutique. L’ordre d’affichage décide de sa place dans la liste.",

  // ── Commandes (§7.2.6) ──
  "orders.title": "Commandes",
  "orders.description":
    "Chaque commande est née PAYÉE : sans passerelle, le règlement par e-card est instantané. Aucune annulation n’est possible.",
  "orders.column.id": "N°",
  "orders.column.member": "Membre",
  "orders.column.context": "Contexte",
  "orders.column.totalDt": "Total",
  "orders.column.totalPoints": "Points",
  "orders.column.status": "Statut",
  "orders.column.ecards": "E-cards",
  "orders.column.shipment": "Expédition",
  "orders.column.date": "Date",
  "orders.filter.context": "Contexte",
  "orders.filter.shipment": "Expédition",
  "orders.filter.contextAll": "Tous les contextes",
  "orders.filter.shipmentAll": "Toutes les expéditions",
  /* L'admin ne connaît QUE le code membre : le n° technique de la base ne lui dit rien. */
  "orders.filter.member": "Code membre",
  "orders.filter.memberPlaceholder": "NP000042",
  "orders.detailTitle": "Commande",
  "orders.section.lines": "Lignes (valeurs figées au checkout)",
  "orders.section.payment": "Règlement",
  "orders.section.shipping": "Livraison",
  "orders.column.product": "Produit",
  "orders.column.quantity": "Qté",
  "orders.column.unitPoints": "Points unitaires",
  "orders.column.unitPrice": "Prix unitaire",
  "orders.field.address": "Adresse",
  "orders.field.paidAt": "Payée le",
  "orders.field.createdAt": "Créée le",
  "orders.ecardCount": "e-card(s) brûlée(s)",
  "orders.ecardHint":
    "Seuls les identifiants sont affichés : un code d’e-card est de la valeur au porteur et ne sort jamais d’une vue de commande.",
  "orders.advanceShipment": "Passer à l’étape suivante",
  "orders.shipmentUpdated": "Suivi d’expédition mis à jour.",
  "orders.shipmentHint":
    "Le colis n’avance que dans un sens. Les frais de livraison se règlent hors système.",
  "orders.noShipment":
    "Cette commande ne contient aucun produit physique : il n’y a rien à expédier.",
  "orders.snapshotHint":
    "Prix et points unitaires sont ceux du jour de l’achat. Revaloriser un produit aujourd’hui ne réécrit pas cette commande.",
  "orders.activationHint":
    "Commande d’ACTIVATION : le total en points vaut le palier du pack, et le total en dinars est le prix du pack moins l’acompte d’inscription.",

  // ── Contextes et statuts de commande ──
  "orderContext.ACTIVATION": "Activation",
  "orderContext.FREE": "Achat libre",
  "orderStatus.PENDING": "En attente",
  "orderStatus.PAID": "Payée",
  "orderStatus.CANCELLED": "Annulée",
  "shipment.PREPARATION": "En préparation",
  "shipment.SHIPPED": "Expédiée",
  "shipment.DELIVERED": "Livrée",
  "shipment.none": "Sans objet",
} as const

export type TranslationKey = keyof typeof fr
export type Dictionary = Record<TranslationKey, string>
