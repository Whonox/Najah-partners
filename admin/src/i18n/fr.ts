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
  // Les deux files de TÂCHES (D-018, D-038) — pas des modules numérotés de §7.2.
  "nav.verifications": "Vérifications",
  "nav.renewals": "Renouvellements",
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

  /* ════════════════════════ Tranche 8c ════════════════════════
     Chaque module a ses PROPRES clés. Recycler « members.column.balance » dans le registre des
     soldes ferait dépendre deux écrans du même libellé : le jour où l'un doit préciser
     « solde après mouvement », l'autre changerait aussi, sans que personne ne l'ait demandé. */

  // ── Avancement d'expédition : irréversible, donc confirmé (harmonisation T8c) ──
  "orders.advanceConfirmTitle": "Faire avancer l’expédition ?",
  "orders.advanceConsequence":
    "Une expédition n’avance que dans un sens : il n’existe aucun retour en arrière, ni dans cet écran ni côté serveur.",

  // ── Confirmation d'action irréversible (transverse) ──
  "confirm.word": "CONFIRMER",
  "confirm.typeToConfirm": "Pour confirmer, recopiez",
  "common.pending": "En cours…",
  "common.confirm": "Confirmer",
  "common.export": "Exporter en CSV",
  "common.period": "Période",
  "common.from": "Du",
  "common.to": "Au",
  "common.total": "Total",
  "common.details": "Détail",
  "common.reason": "Motif",
  "common.reasonRequired": "Le motif est obligatoire : il est tracé dans le journal d’audit.",
  "common.member": "Membre",
  "common.amountDt": "Montant (DT)",
  "common.date": "Date",
  "common.actions": "",

  // ── Tableau de bord (§7.2.1) ──
  "dashboard.title": "Tableau de bord",
  "dashboard.description":
    "État du réseau, de la valeur en circulation et du moteur de commissions. Aucun chiffre n’est recalculé ici : tout vient de ce qui a été écrit.",
  "dashboard.tasksTitle": "Tâches en attente",
  "dashboard.taskIdentity": "Vérifications d’identité",
  "dashboard.taskIdentityHint":
    "Comparer le numéro saisi à l’image. N’empêche rien : un membre non vérifié fonctionne normalement.",
  "dashboard.taskRenewals": "Renouvellements à valider",
  "dashboard.taskRenewalsHint":
    "Payés par e-card, en attente. Tant qu’ils ne sont pas validés, un membre gelé ne perçoit rien.",
  "dashboard.membersTitle": "Réseau",
  "dashboard.membersTotal": "Membres au total",
  "dashboard.membersActive": "Actifs",
  "dashboard.membersRegistered": "Inscrits non activés",
  "dashboard.membersInactive": "Gelés",
  "dashboard.membersActiveHint": "Perçoivent des commissions.",
  "dashboard.membersRegisteredHint": "Inscription payée, aucun point dans l’arbre.",
  "dashboard.membersInactiveHint": "Renouvellement non régularisé (D-034).",
  "dashboard.activationsTitle": "Activations",
  "dashboard.activationsToday": "Aujourd’hui",
  "dashboard.activationsWeek": "Semaine en cours",
  "dashboard.activationsTotal": "Depuis l’origine",
  "dashboard.activationsWeekHint": "Depuis la dernière clôture du vendredi 23:59 (Tunis).",
  "dashboard.packsTitle": "Répartition des packs",
  "dashboard.packsColumnPack": "Pack",
  "dashboard.packsColumnTier": "Palier",
  "dashboard.packsColumnMembers": "Membres activés",
  "dashboard.packsEmpty": "Aucune activation sur un pack pour l’instant.",
  "dashboard.ecardsTitle": "E-cards",
  "dashboard.ecardsActive": "Actives",
  "dashboard.ecardsUsed": "Consommées",
  "dashboard.ecardsActiveHint": "Valeur émise, pas encore dépensée.",
  "dashboard.ecardsUsedHint": "Valeur sortie du système (D-025).",
  "dashboard.circulationTitle": "Dinars dans le système",
  "dashboard.circulationBalances": "Soldes des membres",
  "dashboard.circulationEcards": "En e-cards actives",
  "dashboard.circulationTotal": "Total",
  "dashboard.runTitle": "Moteur de commissions",
  "dashboard.lastRun": "Dernier run",
  "dashboard.lastRunNone": "Aucun run n’a encore été exécuté.",
  "dashboard.nextRun": "Prochain run",
  "dashboard.totalDistributed": "Distribué depuis l’origine",
  "dashboard.runDistributed": "Versé",
  "dashboard.runMembers": "Membres réglés",
  "dashboard.openCommissions": "Voir les runs",
  "dashboard.chartActivations": "Activations par jour",
  "dashboard.chartGrowth": "Croissance du réseau",
  "dashboard.chartActivationsValue": "Activations",
  "dashboard.chartGrowthValue": "Membres",
  "dashboard.chartWindow": "sur les 30 derniers jours",
  "dashboard.twoOverflowsTitle": "Deux « débordements » à ne pas confondre",
  "dashboard.twoOverflows":
    "Les POINTS non appariés restent en réserve (carry-over) indéfiniment : ils ne sont jamais perdus. L’ARGENT au-delà du plafond hebdomadaire est PERDU, jamais reporté.",

  // ── Moteur de commissions — supervision (§7.2.7) ──
  "commissions.title": "Moteur de commissions",
  "commissions.description":
    "Supervision des runs hebdomadaires (vendredi 23:59, heure de Tunis). Le calcul est automatique : cet écran ne calcule rien.",
  "commissions.pendingTitle": "En attente du prochain run",
  "commissions.pendingEvents": "Événements",
  "commissions.pendingEligible": "Dû brut éligible",
  "commissions.pendingIneligible": "Tracé mais jamais payable",
  "commissions.pendingMembers": "Bénéficiaires",
  "commissions.pendingHint":
    "Montant BRUT, avant plafond : chaque membre sera plafonné séparément au moment du run.",
  "commissions.pendingIneligibleHint":
    "Bénéficiaire gelé ou encore inscrit au moment de l’événement (D-034) : l’événement existe, il ne sera jamais payé.",
  "commissions.runsTitle": "Historique des runs",
  "commissions.column.run": "Run",
  "commissions.column.period": "Période réglée",
  "commissions.column.executedAt": "Exécuté le",
  "commissions.column.members": "Membres",
  "commissions.column.distributed": "Distribué",
  "commissions.column.rewardPoints": "Points Fidélité",
  "commissions.column.status": "Statut",
  "commissions.emptyRuns": "Aucun run sur cette période.",
  "commissions.filterStatus": "Statut du run",
  "commissions.filterStatusAll": "Tous les statuts",
  "commissions.relaunch": "Relancer un run",
  "commissions.relaunchTitle": "Relancer le run de la dernière semaine close ?",
  "commissions.relaunchDescription":
    "Rattrapage de secours, à n’utiliser que si le run automatique n’a pas eu lieu.",
  "commissions.relaunchConsequence":
    "L’opération ne peut pas payer deux fois : un événement déjà réclamé par un run ne l’est jamais deux fois. Si la semaine a déjà été réglée, rien ne se passe.",
  "commissions.relaunchConfirm": "Lancer le run",
  "commissions.relaunched": "Run exécuté.",
  "commissions.relaunchAlready":
    "Cette semaine avait déjà été réglée : aucun crédit n’a été refait.",
  "commissions.relaunchFailed": "Le run n’a pas pu être exécuté.",
  "commissions.noRollback":
    "Aucune annulation de run n’est possible : l’argent versé a pu être transformé en e-cards, dont la consommation est irréversible. Le sort de la valeur dans ce cas reste à trancher.",
  "commissions.superAdminOnly": "Seul un super-admin peut relancer un run.",
  "commissions.runTitle": "Run",
  "commissions.runBack": "Retour aux runs",
  "commissions.runGross": "Brut éligible",
  "commissions.runPaid": "Versé",
  "commissions.runLost": "Perdu au plafond",
  "commissions.runLostHint":
    "Argent définitivement perdu (D-033). À ne pas confondre avec les points non appariés, qui restent en réserve.",
  "commissions.runRewardLost": "Points Fidélité perdus",
  "commissions.runMembers": "Membres réglés",
  "commissions.runEvents": "Événements réclamés",
  "commissions.runIneligible": "dont inéligibles",
  "commissions.runUnsettled": "Bénéficiaires sans aucun versement",
  "commissions.runUnsettledHint":
    "Tous leurs événements étaient inéligibles : ils n’apparaissent pas dans la décomposition ci-dessous.",
  "commissions.runLog": "Journal d’exécution",
  "commissions.runLogNone": "Ce run n’a pas de journal d’exécution.",
  "commissions.membersTitle": "Décomposition par membre",
  "commissions.column.cap": "Plafond appliqué",
  "commissions.column.gross": "Brut",
  "commissions.column.paid": "Versé",
  "commissions.column.lost": "Perdu",
  "commissions.column.events": "Événements",
  "commissions.emptyMembers": "Aucun membre réglé sur ce run.",
  "commissions.seeChronology": "Chronologie",
  "commissions.chronologyTitle": "Chronologie du versement",
  "commissions.chronologyHint":
    "Ordre RÉEL d’application du plafond : les événements sont pris par date, et sur une même activation la commission directe passe avant les équilibres.",
  "commissions.column.eventType": "Événement",
  "commissions.column.source": "Filleul à l’origine",
  "commissions.column.occurredAt": "Survenu le",
  "commissions.column.eventAmount": "Dû",
  "commissions.column.cumulative": "Cumul avant",
  "commissions.column.eventPaid": "Payé",
  "commissions.column.eventLost": "Perdu",
  "commissions.crossesCap": "Franchit le plafond",
  "commissions.crossesCapHint":
    "Cet événement est payé PARTIELLEMENT : le plafond de la semaine est atteint en son milieu.",
  "commissions.ineligibleRow": "Inéligible — jamais payé",
  "commissions.rewardGranted": "Point Fidélité accordé",
  "commissions.rewardLost": "Point Fidélité perdu",
  "commissions.capNone": "Aucun plafond appliqué : aucun versement n’a eu lieu.",
  "commissions.balanceIndex": "Équilibre n°",
  "commissions.emptyEvents": "Aucun événement pour ce membre sur ce run.",

  // ── Types d'événement de commission ──
  "eventType.DIRECT": "Commission directe",
  "eventType.BALANCE": "Équilibre",
  "eventType.STARTUP_BONUS": "Bonus de démarrage",
  "eventType.REWARD_POINT": "Point Fidélité",

  // ── Statuts de run ──
  "runStatus.IN_PROGRESS": "En cours",
  "runStatus.SUCCESS": "Réussi",
  "runStatus.ERROR": "Échoué",

  // ── Soldes & mouvements (§7.2.8) ──
  "ledger.title": "Soldes & mouvements",
  "ledger.description":
    "Le grand livre est le journal des SOLDES, donc des dinars. Les points de l’arbre n’y entrent jamais : ils ne sont pas un avoir.",
  "ledger.tabBalances": "Registre des soldes",
  "ledger.tabMovements": "Journal des mouvements",
  "ledger.column.code": "Code",
  "ledger.column.name": "Nom",
  "ledger.column.status": "État",
  "ledger.column.balance": "Solde",
  "ledger.column.movements": "Mouvements",
  "ledger.column.lastMovement": "Dernier mouvement",
  "ledger.totalBalances": "Somme des soldes filtrés",
  "ledger.emptyBalances": "Aucun membre ne correspond à cette recherche.",
  "ledger.withBalanceOnly": "Solde non nul seulement",
  "ledger.filterStatus": "État d’adhésion",
  "ledger.filterStatusAll": "Tous les états",
  "ledger.searchPlaceholder": "Code membre, nom, prénom…",
  "ledger.column.type": "Type",
  "ledger.column.amount": "Montant",
  "ledger.column.balanceAfter": "Solde après",
  "ledger.column.source": "Source",
  "ledger.column.reason": "Motif",
  "ledger.netAmount": "Somme signée des mouvements filtrés",
  "ledger.emptyMovements": "Aucun mouvement sur cette période.",
  "ledger.filterType": "Type de mouvement",
  "ledger.filterTypeAll": "Tous les types",
  "ledger.sourceEcard": "E-card",
  "ledger.sourceCommission": "Commission",
  "ledger.noEcardUse":
    "Consommer une e-card n’écrit AUCUN mouvement ici (D-025) : aucun solde ne bouge, la carte paie directement. Un membre peut donc s’être activé sans qu’aucune ligne n’apparaisse.",
  "ledger.adjust": "Ajuster le solde",
  "ledger.adjustTitle": "Ajustement manuel du solde",
  "ledger.adjustDescription":
    "Montant signé, en dinars : positif pour créditer, négatif pour débiter. Le mouvement est tracé dans le journal d’audit.",
  "ledger.adjustAmount": "Montant signé (DT)",
  "ledger.adjustConfirmTitle": "Confirmer l’ajustement",
  "ledger.adjustConsequence":
    "Le solde du membre change immédiatement. L’opération est tracée avec son auteur et son motif, et ne peut pas être annulée d’un clic — il faudrait un ajustement inverse.",
  "ledger.adjustConfirm": "Ajuster le solde",
  "ledger.adjusted": "Solde ajusté.",
  "ledger.adjustFailed": "L’ajustement n’a pas pu être enregistré.",
  "ledger.genesis": "Générer de la valeur",
  "ledger.genesisTitle": "Génération de valeur (ex nihilo)",
  "ledger.genesisDescription":
    "Cette opération CRÉE des dinars qui n’existaient pas. Aucun membre n’est débité, aucune contrepartie n’est enregistrée : la masse monétaire de la plateforme augmente.",
  "ledger.genesisAmount": "Montant à créer (DT)",
  "ledger.genesisConfirmTitle": "Créer de la valeur ex nihilo ?",
  "ledger.genesisConsequence":
    "Vous allez créditer un membre de dinars qui n’ont été payés par personne. C’est l’opération la plus sensible de la plateforme, réservée à l’amorçage du réseau et aux promotions.",
  "ledger.genesisConfirm": "Créer la valeur",
  "ledger.genesisDone": "Valeur créée et créditée.",
  "ledger.genesisFailed": "La génération n’a pas pu être enregistrée.",
  "ledger.genesisRestricted": "Seul un super-admin peut générer de la valeur.",
  "ledger.adjustRestricted":
    "Votre rôle ne permet pas d’ajuster un solde (super-admin ou gestionnaire).",
  "ledger.memberRequired": "Choisissez d’abord un membre dans le registre.",
  "ledger.selectedMember": "Membre concerné",
  "ledger.amountInvalid": "Montant invalide (3 décimales au maximum, non nul).",
  "ledger.amountPositive": "Le montant doit être strictement positif.",

  // ── Types de mouvement — libellés dédiés au journal global ──
  "movementType.ECARD_CREATION": "Émission d’e-card",
  "movementType.ECARD_REFUND": "Remboursement d’e-card",
  "movementType.COMMISSION": "Commission",
  "movementType.ACTIVATION": "Activation",
  "movementType.ADMIN_ADJUSTMENT": "Ajustement admin",
  "movementType.ADMIN_GENESIS": "Génération de valeur",

  // ── E-cards (§7.2.9) ──
  "ecards.title": "E-cards",
  "ecards.description":
    "Une e-card est de l’argent au porteur. Aucun code n’est jamais affiché ici — ni dans la table, ni dans une fiche, ni après une recherche.",
  "ecards.neverShowCode":
    "Les codes ne sont pas restituables : connaître un code suffit à dépenser la carte. La recherche par code fonctionne (vous le saisissez), mais l’écran ne vous en rendra jamais un.",
  "ecards.column.id": "Identifiant",
  "ecards.column.value": "Valeur",
  "ecards.column.status": "Statut",
  "ecards.column.origin": "Origine",
  "ecards.column.creator": "Créateur",
  "ecards.column.user": "Bénéficiaire",
  "ecards.column.createdAt": "Créée le",
  "ecards.column.usedAt": "Utilisée le",
  "ecards.column.expiresAt": "Échéance",
  "ecards.column.paid": "A payé",
  "ecards.searchCode": "Code d’e-card (exact)",
  "ecards.searchCodePlaceholder": "XXX-XXX-XXX-XXX",
  "ecards.filterStatus": "Statut",
  "ecards.filterStatusAll": "Tous les statuts",
  "ecards.filterOrigin": "Origine",
  "ecards.filterOriginAll": "Toutes les origines",
  "ecards.totalValue": "Valeur des cartes filtrées",
  "ecards.empty": "Aucune e-card ne correspond à ces critères.",
  "ecards.emptySearch":
    "Aucune e-card ne porte ce code. Vérifiez la saisie : la recherche est exacte.",
  "ecards.unlimited": "Illimitée",
  "ecards.paidOrder": "Commande",
  "ecards.paidMembership": "Adhésion",
  "ecards.paidNothing": "Rien encore",
  "ecards.detailTitle": "E-card",
  "ecards.detailBack": "Retour aux e-cards",
  "ecards.traceTitle": "Traçabilité",
  "ecards.traceCreated": "Émission",
  "ecards.traceUsed": "Consommation",
  "ecards.traceClosed": "Clôture (expirée ou révoquée)",
  "ecards.genesisNoCreator":
    "E-card de GENÈSE : créée ex nihilo, sans débiter personne. À son expiration ou sa révocation, personne n’est remboursé.",
  "ecards.ledgerTitle": "Mouvements de solde liés",
  "ecards.ledgerEmpty":
    "Aucun mouvement : c’est le cas normal d’une carte consommée — payer avec une e-card ne fait bouger aucun solde (D-025).",
  "ecards.ledgerEmptyGenesis":
    "Aucun mouvement, et il n’y en aura jamais : une carte de genèse est née ex nihilo, sans débiter le solde de personne.",
  "ecards.revoke": "Révoquer",
  "ecards.revokeTitle": "Révoquer cette e-card ?",
  "ecards.revokeDescription": "La carte devient inutilisable, définitivement.",
  "ecards.revokeConsequence":
    "La valeur de la carte est RECRÉDITÉE au solde de son créateur. Une carte de genèse, elle, ne rembourse personne : sa valeur disparaît.",
  "ecards.revokeConfirm": "Révoquer la carte",
  "ecards.revoked": "E-card révoquée.",
  "ecards.revokeFailed": "La révocation a échoué.",
  "ecards.extend": "Prolonger",
  "ecards.extendTitle": "Prolonger l’échéance",
  "ecards.extendDescription":
    "Repousse la date d’expiration d’une carte encore ACTIVE. Prolonger ne crée aucune valeur : la carte a déjà été payée par son créateur.",
  "ecards.extendDays": "Jours à ajouter",
  "ecards.extendDaysHint": "Entre 1 et 365 jours.",
  "ecards.extended": "Échéance repoussée.",
  "ecards.extendFailed": "La prolongation a échoué.",
  "ecards.genesisAction": "Générer une e-card",
  "ecards.genesisTitle": "Générer une e-card ex nihilo",
  "ecards.genesisDescription":
    "Crée une carte sans débiter aucun solde : sa valeur n’a été payée par personne. Réservé à l’amorçage du réseau et aux promotions.",
  "ecards.genesisValue": "Valeur de la carte (DT)",
  "ecards.genesisExpiration": "Validité (jours)",
  "ecards.genesisExpirationHint":
    "Vide : le paramètre système s’applique. -1 : validité illimitée.",
  "ecards.genesisConfirmTitle": "Créer une e-card ex nihilo ?",
  "ecards.genesisConsequence":
    "La valeur créée n’a aucune contrepartie. À l’expiration ou à la révocation de cette carte, personne ne sera remboursé.",
  "ecards.genesisConfirm": "Générer la carte",
  "ecards.genesisFailed": "La génération de l’e-card a échoué.",
  "ecards.genesisRestricted": "Seul un super-admin peut générer une e-card.",
  "ecards.actionsRestricted":
    "Votre rôle ne permet pas de révoquer ni de prolonger une e-card.",
  "ecards.codeRevealTitle": "E-card générée",
  "ecards.codeRevealBody":
    "Voici le code, affiché UNE SEULE FOIS. Il ne sera plus jamais consultable : transmettez-le maintenant à son destinataire.",
  "ecards.codeRevealWarning":
    "Aucun autre écran, aucune autre réponse de l’API ne le restituera : ni la table, ni la fiche, ni une recherche par code.",
  "ecards.codeCopy": "Copier le code",
  "ecards.codeCopied": "Code copié dans le presse-papiers.",
  "ecards.codeRevealDone": "J’ai transmis le code",
  "ecards.valueInvalid": "Valeur invalide (3 décimales au maximum, strictement positive).",
  "ecards.daysInvalid": "Nombre de jours invalide (entier entre 1 et 365).",
  "ecards.expirationInvalid": "Validité invalide (entier positif, ou -1 pour illimitée).",

  // ── Statuts et origines d'e-card ──
  "ecardStatus.ACTIVE": "Active",
  "ecardStatus.USED": "Consommée",
  "ecardStatus.REVOKED": "Révoquée",
  "ecardStatus.EXPIRED": "Expirée",
  "ecardOrigin.MEMBER": "Membre",
  "ecardOrigin.GENESIS": "Genèse",

  // ── File de vérification d'identité (D-018, D-039) ──
  "verifications.title": "Vérifications d’identité",
  "verifications.description":
    "Comparer le numéro saisi par le membre à l’image de sa pièce, puis apposer le badge.",
  "verifications.nonBlocking":
    "Cette vérification ne bloque RIEN : un membre en attente ou refusé s’inscrit, s’active, perçoit ses commissions et renouvelle normalement. Le badge informe, il n’interdit pas.",
  "verifications.queueTitle": "File d’attente",
  "verifications.column.code": "Code",
  "verifications.column.name": "Nom",
  "verifications.column.registeredAt": "Inscrit le",
  "verifications.empty": "Aucune vérification en attente. La file est vide.",
  "verifications.open": "Traiter",
  "verifications.reviewTitle": "Vérification d’identité",
  "verifications.declared": "Ce que le membre a déclaré",
  "verifications.declaredNumber": "Numéro saisi à la main",
  "verifications.noNumber": "Aucun numéro saisi.",
  "verifications.documentTitle": "Image de la pièce",
  "verifications.noDocument": "Aucune image n’a été déposée par ce membre.",
  "verifications.compareHint":
    "Le numéro ci-contre a été SAISI par le membre : c’est lui qu’il faut comparer à l’image.",
  "verifications.approve": "Marquer vérifiée",
  "verifications.reject": "Refuser",
  "verifications.approveTitle": "Marquer cette identité comme vérifiée ?",
  "verifications.approveConsequence":
    "Le badge « vérifiée » est apposé, avec votre nom et la date. Cela n’ouvre aucun droit nouveau : le membre fonctionnait déjà normalement.",
  "verifications.rejectTitle": "Refuser cette pièce d’identité ?",
  "verifications.rejectConsequence":
    "Le motif est enregistré et visible sur la fiche du membre. Le refus ne bloque rien : le membre continue de s’activer et de percevoir.",
  "verifications.rejectReason": "Motif du refus",
  "verifications.rejectReasonHint":
    "Obligatoire : le membre doit savoir ce qu’il faut corriger.",
  "verifications.approved": "Identité marquée comme vérifiée.",
  "verifications.rejected": "Pièce refusée, motif enregistré.",
  "verifications.failed": "Le verdict n’a pas pu être enregistré.",
  "verifications.restricted":
    "Votre rôle ne permet pas de statuer sur une vérification (super-admin ou gestionnaire).",
  "verifications.verdictBy": "Statué par",
  "verifications.verdictAt": "le",
  "verifications.verdictReason": "Motif du refus",

  // ── Validation des renouvellements (D-038) ──
  "renewals.title": "Renouvellements à valider",
  "renewals.description":
    "Renouvellements annuels déjà PAYÉS par e-card, en attente de votre validation.",
  "renewals.blocking":
    "Tant que vous n’avez pas validé, un membre gelé reste gelé et ne perçoit AUCUNE commission — même s’il a payé. Payer ne dégèle pas (D-038).",
  "renewals.noRefusal":
    "Il n’existe pas de bouton « refuser », et ce n’est pas un oubli : les e-cards ont été brûlées au paiement et cette consommation est irréversible. Ce que deviendrait la valeur en cas de refus n’est pas tranché — vous pouvez valider, ou laisser en attente.",
  "renewals.column.member": "Membre",
  "renewals.column.status": "État actuel",
  "renewals.column.amount": "Montant payé",
  "renewals.column.paidAt": "Payé le",
  "renewals.column.renewalAt": "Échéance actuelle",
  "renewals.column.ecards": "E-cards brûlées",
  "renewals.ecardIds": "Identifiants uniquement — jamais les codes.",
  "renewals.empty": "Aucun renouvellement en attente de validation.",
  "renewals.validate": "Valider",
  "renewals.validateTitleFrozen": "Valider et réactiver ce membre ?",
  "renewals.validateTitleActive": "Valider ce renouvellement anticipé ?",
  "renewals.validateConsequenceFrozen":
    "Le membre redevient ACTIF. Une NOUVELLE baseline est figée : les points arrivés pendant le gel ne lui rapporteront jamais rien. Son carry-over d’avant le gel, en revanche, est CONSERVÉ.",
  "renewals.validateConsequenceActive":
    "Le membre était déjà actif : seule son échéance est repoussée. Aucune nouvelle baseline n’est figée — la figer lui coûterait son carry-over en cours.",
  "renewals.validateConfirm": "Valider le renouvellement",
  "renewals.validatedFrozen": "Renouvellement validé : le membre est réactivé.",
  "renewals.validatedActive": "Renouvellement validé : échéance repoussée.",
  "renewals.validateFailed": "La validation a échoué.",
  "renewals.restricted":
    "Votre rôle ne permet pas de valider un renouvellement (super-admin ou gestionnaire).",

  // ── Rapports & analytics (§7.2.10) ──
  "reports.title": "Rapports",
  "reports.description":
    "Agrégats sur des données déjà écrites. Les exports CSV reprennent exactement ce que montre le tableau.",
  "reports.tabSales": "Ventes produits",
  "reports.tabActivations": "Activations par pack",
  "reports.tabCommissions": "Commissions par période",
  "reports.tabCirculation": "Dinars en circulation",
  "reports.tabTop": "Top affiliés",
  "reports.salesColumnProduct": "Produit",
  "reports.salesColumnCategory": "Catégorie",
  "reports.salesColumnQuantity": "Unités",
  "reports.salesColumnTotalDt": "Total prix",
  "reports.salesColumnTotalPoints": "Total points",
  "reports.salesColumnOrders": "Commandes",
  "reports.salesEmpty": "Aucune vente sur cette période.",
  "reports.salesHint":
    "Le total en prix est la somme des prix des lignes, figés à l’achat. En ACTIVATION, ce n’est PAS ce que la commande a fait payer : le montant encaissé est le prix du pack moins l’acompte.",
  "reports.byContextTitle": "Commandes par contexte",
  "reports.contextColumnOrders": "Commandes",
  "reports.contextColumnTotalDt": "Encaissé",
  "reports.contextColumnTotalPoints": "Points des paniers",
  "reports.activationsColumnPack": "Pack",
  "reports.activationsColumnTier": "Palier",
  "reports.activationsColumnCount": "Activations",
  "reports.activationsColumnCollected": "Encaissé",
  "reports.activationsColumnPoints": "Points injectés",
  "reports.activationsEmpty": "Aucune activation sur cette période.",
  "reports.activationsHint":
    "L’encaissé est le prix du pack moins l’acompte d’inscription (D-037). Les points injectés, eux, sont le palier ENTIER : l’acompte ne touche que l’argent.",
  "reports.commissionsColumnRun": "Run",
  "reports.commissionsColumnPeriod": "Semaine réglée",
  "reports.commissionsColumnMembers": "Membres",
  "reports.commissionsColumnGross": "Brut éligible",
  "reports.commissionsColumnPaid": "Versé",
  "reports.commissionsColumnLost": "Perdu au plafond",
  "reports.commissionsColumnRewards": "Points Fidélité",
  "reports.commissionsEmpty": "Aucun run sur cette période.",
  "reports.circulationBalances": "Soldes des membres",
  "reports.circulationActive": "En e-cards actives",
  "reports.circulationInSystem": "Dans le système",
  "reports.circulationConsumed": "Sorti par consommation d’e-cards",
  "reports.circulationGenesisEcards": "Créé ex nihilo (e-cards)",
  "reports.circulationGenesisBalance": "Créé ex nihilo (soldes)",
  "reports.circulationCommissions": "Versé en commissions",
  "reports.circulationHint":
    "Ces lignes ne s’additionnent pas toutes : « dans le système » est la seule somme (soldes + e-cards actives). Le reste décrit des flux depuis l’origine.",
  "reports.topColumnMember": "Affilié",
  "reports.topColumnPack": "Pack",
  "reports.topColumnPaid": "Commissions perçues",
  "reports.topColumnRuns": "Runs",
  "reports.topColumnBalances": "Équilibres à vie",
  "reports.topColumnRewards": "Points Fidélité",
  "reports.topEmpty": "Aucune commission versée sur cette période.",
  "reports.topHint":
    "Classement sur les commissions réellement PERÇUES, plafond appliqué — pas sur le montant dû.",
  "reports.periodAll": "Depuis l’origine",

  // ── Comptes admin & rôles (§7.2.12) ──
  "adminUsers.title": "Comptes admin",
  "adminUsers.description":
    "Comptes administrateurs et rôles. Réservé au super-admin : cette liste est la carte des privilèges de la plateforme.",
  "adminUsers.rolesFixed":
    "Les rôles sont FIXES et leurs droits sont codés dans le backend : il n’existe pas de matrice de permissions modifiable ici. Cette question n’est pas tranchée avec la cliente.",
  "adminUsers.column.name": "Nom",
  "adminUsers.column.email": "Adresse e-mail",
  "adminUsers.column.role": "Rôle",
  "adminUsers.column.state": "Compte",
  "adminUsers.column.lastLogin": "Dernière connexion",
  "adminUsers.column.sessions": "Sessions actives",
  "adminUsers.neverConnected": "Jamais connecté",
  "adminUsers.empty": "Aucun compte administrateur.",
  "adminUsers.new": "Nouveau compte",
  "adminUsers.createTitle": "Créer un compte administrateur",
  "adminUsers.editTitle": "Modifier le compte",
  "adminUsers.name": "Nom",
  "adminUsers.email": "Adresse e-mail",
  "adminUsers.role": "Rôle",
  "adminUsers.password": "Mot de passe initial",
  "adminUsers.passwordHint":
    "10 caractères minimum. Aucun e-mail n’est envoyé : transmettez-le vous-même, hors de la plateforme.",
  "adminUsers.activeSwitch": "Compte actif",
  "adminUsers.activeHint":
    "Désactiver coupe l’accès et révoque immédiatement les sessions en cours.",
  "adminUsers.created": "Compte créé.",
  "adminUsers.updated": "Compte mis à jour.",
  "adminUsers.saveFailed": "L’enregistrement a échoué.",
  "adminUsers.emailInvalid": "Adresse e-mail invalide.",
  "adminUsers.passwordTooShort": "10 caractères minimum.",
  "adminUsers.resetPassword": "Réinitialiser le mot de passe",
  "adminUsers.resetTitle": "Réinitialiser le mot de passe",
  "adminUsers.resetDescription":
    "Vous posez un nouveau mot de passe et le transmettez hors plateforme : aucun e-mail de réinitialisation n’existe.",
  "adminUsers.resetNewPassword": "Nouveau mot de passe",
  "adminUsers.resetConsequence":
    "Les sessions en cours de ce compte sont révoquées : la personne devra se reconnecter avec le nouveau mot de passe.",
  "adminUsers.resetConfirm": "Réinitialiser",
  "adminUsers.resetDone": "Mot de passe réinitialisé, sessions révoquées.",
  "adminUsers.resetFailed": "La réinitialisation a échoué.",
  "adminUsers.deactivateTitle": "Désactiver ce compte ?",
  "adminUsers.deactivateConsequence":
    "La personne ne pourra plus se connecter et ses sessions en cours sont révoquées. Le compte n’est pas supprimé : ce qu’il a validé doit rester attribuable.",
  "adminUsers.deactivateConfirm": "Désactiver",
  "adminUsers.reactivateTitle": "Réactiver ce compte ?",
  "adminUsers.reactivateConsequence":
    "La personne pourra se reconnecter avec son mot de passe existant et retrouvera les droits de son rôle.",
  "adminUsers.reactivateConfirm": "Réactiver",
  "adminUsers.noDelete":
    "Aucun compte ne se supprime : il reste référencé par ce qu’il a validé (renouvellements, e-cards de genèse, vérifications). On désactive.",
  "adminUsers.selfHint": "C’est votre compte : vous ne pouvez ni le désactiver ni le dégrader.",
  "adminUsers.sessionsTitle": "Journal des sessions",
  "adminUsers.sessionsDescription":
    "Sessions reconstituées depuis les jetons de rafraîchissement : ouverture, adresse IP, navigateur.",
  "adminUsers.sessionsIncomplete":
    "Ce journal ne contient PAS les tentatives de connexion échouées : rien ne les enregistre en base. Une liste vide ne signifie donc pas « aucune tentative ».",
  "adminUsers.sessionColumn.started": "Ouverte le",
  "adminUsers.sessionColumn.lastSeen": "Dernière activité",
  "adminUsers.sessionColumn.ip": "Adresse IP",
  "adminUsers.sessionColumn.agent": "Navigateur",
  "adminUsers.sessionColumn.state": "État",
  "adminUsers.sessionCurrent": "En cours",
  "adminUsers.sessionClosed": "Terminée",
  "adminUsers.sessionsEmpty": "Ce compte ne s’est jamais connecté.",
  "adminUsers.sessionsOpen": "Sessions",
  "adminUsers.unknownIp": "Inconnue",
  "adminUsers.unknownAgent": "Inconnu",
} as const

export type TranslationKey = keyof typeof fr
export type Dictionary = Record<TranslationKey, string>
