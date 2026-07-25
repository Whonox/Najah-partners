import { isTrivialPin, PIN_PATTERN } from './pin';
import {
  ANSWERS_REQUIRED_FOR_PIN_RESET,
  isSecurityQuestionKey,
  MIN_NORMALIZED_ANSWER_LENGTH,
  normalizeSecurityAnswer,
  REQUIRED_SECURITY_ANSWERS,
  SECURITY_QUESTION_KEYS,
} from './security-questions';

/**
 * Ce que ces tests tiennent :
 *  — la NORMALISATION est ce qui rend la comparaison « insensible à la casse et aux espaces »
 *    exigée par D-050. Si elle se dégrade, la seconde authentification par question secrète
 *    devient inutilisable — et avec elle le SEUL recours de réinitialisation d'un PIN oublié
 *    (D-011 : aucun canal e-mail ni SMS). Ces cas sont donc des garde-fous, pas des détails ;
 *  — la classe de caractères combinants est écrite en séquences d'échappement : un test qui
 *    déplie réellement un accent échouerait si un reformatage la détruisait en silence ;
 *  — la politique de PIN écarte ce qu'un attaquant essaie EN PREMIER, ce qui compte quand le
 *    blocage n'arrive qu'au 5e essai (D-058).
 */

describe('normalizeSecurityAnswer', () => {
  it('déplie les accents — « Béja » et « Beja » sont la même réponse', () => {
    expect(normalizeSecurityAnswer('Béja')).toBe(normalizeSecurityAnswer('Beja'));
    expect(normalizeSecurityAnswer('Sfâx')).toBe('sfax');
  });

  it('ignore la casse', () => {
    expect(normalizeSecurityAnswer('BELLA')).toBe(normalizeSecurityAnswer('bella'));
  });

  it('ignore les espaces de bord et réduit les espaces internes', () => {
    expect(normalizeSecurityAnswer('  Ben   Salah  ')).toBe('ben salah');
  });

  it('rend une chaîne vide pour une saisie qui n’est que des espaces — d’où le contrôle de longueur sur la forme NORMALISÉE', () => {
    expect(normalizeSecurityAnswer('   ')).toBe('');
    expect(normalizeSecurityAnswer('   ').length).toBeLessThan(
      MIN_NORMALIZED_ANSWER_LENGTH,
    );
  });

  it('ne fusionne PAS ponctuation et espaces : deux réponses réellement différentes le restent', () => {
    expect(normalizeSecurityAnswer('Sidi-Bou-Said')).not.toBe(
      normalizeSecurityAnswer('Sidi Bou Said'),
    );
  });

  it('est idempotente — normaliser une forme déjà normalisée ne la change plus', () => {
    const once = normalizeSecurityAnswer('  École   Ibn Khaldoûn ');
    expect(normalizeSecurityAnswer(once)).toBe(once);
  });
});

describe('catalogue des questions', () => {
  it('ne contient aucun doublon — une clé dupliquée casserait la contrainte d’unicité par membre', () => {
    expect(new Set(SECURITY_QUESTION_KEYS).size).toBe(
      SECURITY_QUESTION_KEYS.length,
    );
  });

  it('offre strictement plus de questions qu’il n’en faut en choisir', () => {
    expect(SECURITY_QUESTION_KEYS.length).toBeGreaterThan(
      REQUIRED_SECURITY_ANSWERS,
    );
  });

  it('exige moins de bonnes réponses pour réinitialiser un PIN qu’il n’y a de questions (D-058)', () => {
    expect(ANSWERS_REQUIRED_FOR_PIN_RESET).toBeLessThan(
      REQUIRED_SECURITY_ANSWERS,
    );
    expect(ANSWERS_REQUIRED_FOR_PIN_RESET).toBeGreaterThan(1);
  });

  it('reconnaît ses clés et rejette les autres', () => {
    expect(isSecurityQuestionKey('FIRST_SCHOOL')).toBe(true);
    expect(isSecurityQuestionKey('FAVORITE_COLOR')).toBe(false);
  });
});

describe('politique de PIN', () => {
  it('accepte 4 à 6 chiffres, refuse le reste', () => {
    expect(PIN_PATTERN.test('4827')).toBe(true);
    expect(PIN_PATTERN.test('482715')).toBe(true);
    expect(PIN_PATTERN.test('482')).toBe(false);
    expect(PIN_PATTERN.test('4827159')).toBe(false);
    expect(PIN_PATTERN.test('48a7')).toBe(false);
    expect(PIN_PATTERN.test('')).toBe(false);
  });

  it('refuse les chiffres identiques', () => {
    expect(isTrivialPin('0000')).toBe(true);
    expect(isTrivialPin('999999')).toBe(true);
  });

  it('refuse les suites consécutives, dans les deux sens', () => {
    expect(isTrivialPin('1234')).toBe(true);
    expect(isTrivialPin('4321')).toBe(true);
    expect(isTrivialPin('456789')).toBe(true);
  });

  it('accepte un PIN ordinaire', () => {
    expect(isTrivialPin('4827')).toBe(false);
    expect(isTrivialPin('1235')).toBe(false); // presque une suite, mais pas une suite
    expect(isTrivialPin('1122')).toBe(false);
  });
});
