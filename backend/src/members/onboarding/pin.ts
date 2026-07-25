/**
 * Politique du PIN de seconde authentification (D-051, D-058).
 *
 * Le PIN garde l'accès à l'argent : création d'e-card, paiement, renouvellement, écrans de
 * gains et de solde. Il est court par nature — c'est ce qui le rend utilisable au téléphone,
 * plusieurs fois par semaine — donc sa robustesse ne vient PAS de sa longueur mais du
 * compteur d'essais commun aux deux voies (5 échecs → blocage 15 min, D-058). Les règles
 * ci-dessous ne font qu'écarter les PIN qu'un attaquant essaie EN PREMIER.
 */

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 6;

/** Un PIN n'est fait que de chiffres : le clavier numérique du téléphone, rien d'autre. */
export const PIN_PATTERN = /^\d{4,6}$/;

/**
 * PIN refusés parce qu'ils sont les premiers essayés.
 *
 * Sur 10 000 combinaisons à 4 chiffres, une poignée concentre une part énorme des choix réels
 * (« 1234 », « 0000 », « 1111 »…). Avec 5 essais avant blocage, laisser passer ces valeurs
 * reviendrait à offrir une chance non négligeable à un attaquant qui ne tenterait QUE
 * celles-là — le blocage protège contre l'exhaustif, pas contre le devinable.
 *
 * Deux familles, détectées par forme et non par liste (une liste serait vite incomplète, et
 * il faudrait la maintenir pour chaque longueur de 4 à 6) :
 *  - tous les chiffres identiques : 0000, 1111, 999999… ;
 *  - suite strictement consécutive, croissante ou décroissante : 1234, 4321, 456789…
 *
 * Ce que l'on ne fait PAS : refuser une date de naissance. On ne la connaît pas — elle n'est
 * pas collectée (D-011 : pas de KYC) — et la deviner à partir du numéro de pièce serait une
 * heuristique fragile qui refuserait des PIN légitimes.
 */
export function isTrivialPin(pin: string): boolean {
  const digits = [...pin].map(Number);

  const allIdentical = digits.every((d) => d === digits[0]);
  if (allIdentical) return true;

  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);

  return ascending || descending;
}
