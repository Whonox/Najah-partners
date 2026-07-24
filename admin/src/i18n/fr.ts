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
} as const

export type TranslationKey = keyof typeof fr
export type Dictionary = Record<TranslationKey, string>
