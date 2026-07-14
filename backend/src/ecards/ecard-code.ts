import { randomInt } from 'crypto';

/**
 * Alphabet des codes e-card : majuscules + chiffres, MOINS les caractères ambigus à la
 * lecture (I/1, O/0). Un code se transmet à la voix ou sur un bout de papier, hors
 * plateforme : une confusion coûterait une e-card. 32 symboles × 12 positions =
 * 1,15 × 10^18 codes — l'espace reste hors de portée d'une énumération.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUPS = 4;
const GROUP_SIZE = 3;

/** `XXX-XXX-XXX-XXX` — 4 groupes de 3 caractères de l'alphabet ci-dessus. */
export const ECARD_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{3}(-[A-HJ-NP-Z2-9]{3}){3}$/;

/**
 * Génère un code e-card imprévisible. `crypto.randomInt` (CSPRNG) et non `Math.random` :
 * un code EST de la valeur — un générateur prédictible laisserait deviner les e-cards des
 * autres membres. L'unicité n'est pas garantie ici mais par l'index unique en base :
 * l'appelant régénère en cas de collision (voir EcardsService.create).
 */
export function generateEcardCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = '';
    for (let c = 0; c < GROUP_SIZE; c += 1) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/** Normalise une saisie utilisateur (espaces, minuscules) avant lookup. */
export function normalizeEcardCode(input: string): string {
  return input.trim().toUpperCase();
}
