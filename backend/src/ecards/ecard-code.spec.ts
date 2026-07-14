import {
  ECARD_CODE_PATTERN,
  generateEcardCode,
  normalizeEcardCode,
} from './ecard-code';

describe('Code e-card — format et imprévisibilité', () => {
  it('respecte le format XXX-XXX-XXX-XXX (spec §5.5)', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateEcardCode()).toMatch(ECARD_CODE_PATTERN);
    }
  });

  it('n’emploie jamais de caractère ambigu (I, O, 0, 1) — un code se recopie à la main', () => {
    const codes = Array.from({ length: 200 }, () => generateEcardCode()).join(
      '',
    );
    expect(codes).not.toMatch(/[IO01]/);
  });

  it('ne se répète pas : 5 000 tirages, 5 000 codes distincts', () => {
    const codes = new Set(
      Array.from({ length: 5_000 }, () => generateEcardCode()),
    );
    expect(codes.size).toBe(5_000);
  });

  it('se distingue d’un code membre (NP + numéro) — aucune confusion possible', () => {
    expect(generateEcardCode()).not.toMatch(/^NP\d+$/);
  });

  it('normalise la saisie (espaces, minuscules) avant lookup', () => {
    expect(normalizeEcardCode('  hhd-7z7-jjd-77d \n')).toBe('HHD-7Z7-JJD-77D');
  });

  it('rejette les formats voisins mais faux', () => {
    for (const bad of [
      'HHD-7Z7-JJD',
      'HHD-7Z7-JJD-77D-77D',
      'HHD7Z7JJD77D',
      'HHD-7Z7-JJD-77',
      'IOD-7Z7-JJD-77D', // caractères hors alphabet
      '',
    ]) {
      expect(bad).not.toMatch(ECARD_CODE_PATTERN);
    }
  });
});
