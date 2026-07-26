/**
 * Libellés FRANÇAIS des questions secrètes (D-050, D-057).
 *
 * ═══ POURQUOI ILS SONT ICI ET PAS DANS L'API ═══
 * Le backend ne rend que des CLÉS. Les clés sont du code (anglais, D-015) ; les libellés sont
 * de l'interface. Les faire voyager par l'API aurait dispersé des textes utilisateur entre
 * deux dépôts et lié la future traduction arabe (RTL) à un redéploiement du backend.
 *
 * ═══ LA CLÉ INCONNUE EST PRÉVUE ═══
 * L'accès passe par `SECURITY_QUESTION_LABEL[key] ?? repli`. Si le backend ajoute une
 * question avant que le portail ne soit redéployé, l'affilié voit un libellé générique plutôt
 * qu'une case vide — et surtout, il peut toujours répondre : c'est le SEUL recours pour
 * réinitialiser un PIN oublié (D-011, aucun canal e-mail ni SMS).
 *
 * ═══ FORMULATION ═══
 * Chaque question est écrite à la deuxième personne et vise un souvenir STABLE (il ne change
 * pas avec la vie), MÉMORABLE dans un an et sous pression, et NON PUBLIC (il ne se lit pas
 * sur un profil de réseau social).
 */
export const SECURITY_QUESTION_LABEL: Record<string, string> = {
  CHILDHOOD_STREET: "Dans quelle rue avez-vous grandi ?",
  FIRST_SCHOOL: "Quel est le nom de votre première école ?",
  CHILDHOOD_NICKNAME: "Quel surnom vous donnait-on enfant ?",
  FIRST_PET_NAME: "Comment s’appelait votre premier animal ?",
  FAVORITE_TEACHER: "Quel est le nom de votre enseignant préféré ?",
  CLOSEST_CHILDHOOD_FRIEND: "Comment s’appelait votre meilleur ami d’enfance ?",
  GRANDMOTHER_FIRST_NAME: "Quel est le prénom de votre grand-mère maternelle ?",
  FIRST_EMPLOYER: "Quel a été votre premier employeur ?",
  CHILDHOOD_DISH: "Quel plat vous préparait-on enfant ?",
  FIRST_CITY_VISITED: "Quelle est la première ville que vous avez visitée ?",
}
