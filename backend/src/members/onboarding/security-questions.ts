/**
 * Catalogue des questions secrètes (D-050, D-057).
 *
 * ═══ POURQUOI UNE CONSTANTE ET NON UNE TABLE ═══
 * Ces clés sont du CODE (anglais, D-015) ; leurs libellés sont de l'INTERFACE (français,
 * `portal/src/i18n/fr.ts`). Aucun CRUD n'est demandé — l'admin ne gère pas ce catalogue.
 * Une table n'apporterait qu'une jointure de plus et une migration à chaque libellé retouché,
 * pour une liste qui bouge une fois par an. Le contrat public ne rend donc que les CLÉS :
 * le portail les traduit, et TypeScript échoue à la compilation si une clé n'a pas de libellé.
 *
 * ═══ CE QUI GUIDE LE CHOIX DES QUESTIONS ═══
 * Une bonne question secrète a une réponse STABLE (elle ne change pas avec la vie du membre),
 * MÉMORABLE (il la retrouvera dans un an, sous pression) et NON PUBLIQUE (elle ne se lit pas
 * sur un profil de réseau social). « Votre voiture actuelle » échoue au premier critère,
 * « votre film préféré » au deuxième, « votre ville de naissance » serait limite sur le
 * troisième — d'où la préférence pour des souvenirs d'enfance, qui ne figurent nulle part.
 *
 * ═══ NE JAMAIS RETIRER UNE CLÉ DE CETTE LISTE ═══
 * Les réponses en base référencent ces clés. Supprimer une entrée rendrait inutilisables les
 * réponses des membres qui l'avaient choisie — et donc leur seul recours de réinitialisation
 * de PIN (D-011 : aucun canal e-mail ni SMS). Pour retirer une question de l'offre, il faudra
 * la marquer comme non proposable tout en continuant de l'accepter en vérification.
 */
export const SECURITY_QUESTION_KEYS = [
  'CHILDHOOD_STREET',
  'FIRST_SCHOOL',
  'CHILDHOOD_NICKNAME',
  'FIRST_PET_NAME',
  'FAVORITE_TEACHER',
  'CLOSEST_CHILDHOOD_FRIEND',
  'GRANDMOTHER_FIRST_NAME',
  'FIRST_EMPLOYER',
  'CHILDHOOD_DISH',
  'FIRST_CITY_VISITED',
] as const;

export type SecurityQuestionKey = (typeof SECURITY_QUESTION_KEYS)[number];

/** Nombre de questions qu'un membre doit renseigner au parcours d'accueil (D-050). */
export const REQUIRED_SECURITY_ANSWERS = 3;

/**
 * Nombre de bonnes réponses exigées pour réinitialiser un PIN oublié (D-058).
 *
 * DEUX sur trois, et non trois : la réinitialisation est le SEUL recours d'un membre qui a
 * oublié son PIN — aucun canal e-mail ni SMS n'existe (D-011). Exiger les trois ferait d'un
 * unique trou de mémoire une perte définitive d'accès aux écrans d'argent. Deux restent
 * nettement au-dessus de ce qu'une seule question protège, et le compteur commun (5 échecs →
 * blocage) empêche d'en faire un terrain de tâtonnement.
 */
export const ANSWERS_REQUIRED_FOR_PIN_RESET = 2;

export function isSecurityQuestionKey(
  value: string,
): value is SecurityQuestionKey {
  return (SECURITY_QUESTION_KEYS as readonly string[]).includes(value);
}

/**
 * Marques diacritiques isolées par la décomposition NFD (U+0300 à U+036F).
 *
 * Écrite en SÉQUENCES D'ÉCHAPPEMENT et jamais avec les caractères eux-mêmes : ce sont des
 * marques combinantes, invisibles dans un éditeur — collées telles quelles dans le source,
 * elles se font silencieusement détruire par un reformatage, un copier-coller ou un outil qui
 * normalise le fichier, et la fonction cesserait de déplier les accents sans qu'aucun test de
 * compilation ne bronche.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Normalise une réponse AVANT hachage et AVANT comparaison — les deux doivent appliquer
 * exactement la même fonction, sinon aucune réponse ne serait jamais reconnue.
 *
 * Quatre traitements, dans cet ordre :
 *  1. dépliage des accents (« Béja » / « Beja ») — un membre ne retape pas ses accents à
 *     l'identique un an plus tard, et certains claviers ne les produisent pas ;
 *  2. `trim` — un espace de fin arrivé par un copier-coller ou par le clavier mobile ;
 *  3. réduction des espaces internes — « Ben  Salah » et « Ben Salah » sont la même réponse ;
 *  4. minuscules — la casse est ici du bruit, jamais du sens.
 *
 * Ce que l'on ne fait PAS : retirer la ponctuation ou les tirets. « Sidi-Bou-Saïd » et
 * « Sidi Bou Said » resteraient distincts — c'est assumé, normaliser plus loin commencerait
 * à faire coïncider des réponses réellement différentes, ce qui affaiblirait le secret.
 *
 * Le résultat est ce qui est haché : la réponse SAISIE n'existe nulle part — ni en base, ni
 * en log, ni dans l'AuditLog.
 */
export function normalizeSecurityAnswer(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Longueur minimale d'une réponse NORMALISÉE. Une réponse d'un ou deux caractères ne serait
 * pas un secret : elle se devine en quelques essais, et le membre l'aura de toute façon
 * oubliée. Contrôlé sur la forme normalisée, sinon trois espaces passeraient le contrôle.
 */
export const MIN_NORMALIZED_ANSWER_LENGTH = 2;
