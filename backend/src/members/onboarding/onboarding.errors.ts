import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH } from './pin';
import {
  MIN_NORMALIZED_ANSWER_LENGTH,
  REQUIRED_SECURITY_ANSWERS,
} from './security-questions';

/**
 * Erreurs du parcours d'accueil (D-050) et de la seconde authentification (D-051).
 *
 * ═══ DEUX RÉGIMES OPPOSÉS, ET C'EST VOULU ═══
 * Les erreurs du PARCOURS D'ACCUEIL sont PRÉCISES : le membre est authentifié, il remplit un
 * formulaire, et lui cacher pourquoi son PIN est refusé ne protégerait rien — il ne devine pas
 * son propre secret, il est en train de le choisir.
 *
 * Les erreurs de la SECONDE AUTHENTIFICATION sont au contraire volontairement INDISTINCTES
 * (`StepUpRefusedError`) : c'est là qu'on tâtonne. Même code, même message pour « PIN faux »,
 * « réponse fausse », « jeton expiré » et « compte bloqué ». Voir la classe pour le détail.
 */

/** Le parcours d'accueil (D-050) n'est pas terminé : le portail est fermé. */
export class OnboardingRequiredError extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      // `code` permet au portail de router vers le parcours d'accueil plutôt que d'afficher
      // une erreur : un 403 générique serait indistinguable d'un vrai refus de droits.
      code: 'ONBOARDING_REQUIRED',
      message:
        'Votre première connexion n’est pas terminée : déposez votre pièce d’identité, ' +
        'choisissez vos trois questions secrètes et créez votre code PIN pour accéder au portail.',
    });
  }
}

/** Étape déjà franchie et non rejouable par ce chemin (il faudrait la seconde auth). */
export class OnboardingAlreadyCompletedError extends BadRequestException {
  constructor(what: 'questions' | 'pin') {
    super(
      what === 'questions'
        ? 'Vos questions secrètes sont déjà enregistrées. Leur modification passe par une ' +
            'vérification de sécurité depuis votre profil.'
        : 'Votre code PIN est déjà créé. Pour le changer, passez par votre profil ; si vous ' +
            'l’avez oublié, réinitialisez-le avec vos questions secrètes.',
    );
  }
}

/** Le lot de questions secrètes est mal formé (nombre, doublon, clé inconnue, réponse vide). */
export class InvalidSecurityAnswersError extends BadRequestException {
  constructor(
    reason: 'count' | 'duplicate' | 'unknown-key' | 'answer-too-short',
  ) {
    const messages: Record<typeof reason, string> = {
      count: `Choisissez exactement ${REQUIRED_SECURITY_ANSWERS} questions secrètes.`,
      duplicate:
        'Choisissez trois questions DIFFÉRENTES : trois fois la même ne protégerait rien.',
      'unknown-key': 'Question inconnue.',
      'answer-too-short': `Chaque réponse doit compter au moins ${MIN_NORMALIZED_ANSWER_LENGTH} caractères.`,
    };
    super(messages[reason]);
  }
}

/** PIN refusé : forme invalide ou trop devinable. */
export class InvalidPinError extends BadRequestException {
  constructor(reason: 'format' | 'trivial') {
    super(
      reason === 'format'
        ? `Votre code PIN doit compter de ${MIN_PIN_LENGTH} à ${MAX_PIN_LENGTH} chiffres.`
        : 'Ce code est trop simple à deviner (chiffres identiques ou qui se suivent). ' +
            'Choisissez-en un autre : il protège votre argent.',
    );
  }
}
