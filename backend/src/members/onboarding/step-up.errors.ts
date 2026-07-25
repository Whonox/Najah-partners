import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

/**
 * Refus de seconde authentification (D-051, D-058).
 *
 * ═══ UN SEUL MESSAGE, UN SEUL CODE, POUR TOUS LES CAS ═══
 * PIN faux, réponse secrète fausse, question inconnue, jeton de défi expiré, compte
 * temporairement bloqué : la réponse est IDENTIQUE. Aucune de ces situations n'est
 * distinguable de l'extérieur, et c'est l'essentiel de la protection :
 *
 *  - dire « PIN incorrect » plutôt que « réponse incorrecte » indiquerait à l'attaquant
 *    laquelle des deux voies il vient d'essayer et laquelle il lui reste à épuiser ;
 *  - dire « compte bloqué pendant 15 minutes » lui donnerait la cadence exacte à respecter
 *    pour tâtonner indéfiniment sans jamais déclencher le blocage ;
 *  - dire « il vous reste 2 essais » lui apprendrait où s'arrêter pour ne pas se faire
 *    bloquer, et donc comment tâtonner en continu.
 *
 * Le membre légitime, lui, n'a pas besoin de la distinction : il sait quelle méthode il vient
 * d'employer, et le message lui dit quoi faire (réessayer, ou passer par l'autre voie).
 *
 * La DISTINCTION EXISTE, mais elle vit dans l'`AuditLog` — côté serveur, pour le support et
 * l'analyse, jamais dans la réponse HTTP.
 */
export class StepUpRefusedError extends UnauthorizedException {
  constructor() {
    super({
      statusCode: 401,
      code: 'STEP_UP_REFUSED',
      message:
        'Vérification impossible. Réessayez, ou utilisez l’autre méthode : votre code PIN ' +
        'ou l’une de vos questions secrètes.',
    });
  }
}

/**
 * L'opération exige une seconde authentification que l'appelant n'a pas fournie (ou dont le
 * jeton a expiré).
 *
 * DISTINCT de `StepUpRefusedError`, et ce n'est pas une contradiction : ici, rien n'a été
 * TENTÉ. Le portail doit savoir qu'il faut ouvrir la boîte de dialogue de vérification —
 * répondre « vérification impossible » à une requête qui n'a rien tenté le laisserait sans
 * rien à afficher. Aucune information exploitable ne fuit : ce refus ne dépend d'aucun
 * secret, seulement de l'absence d'un en-tête.
 */
export class StepUpRequiredError extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: 'STEP_UP_REQUIRED',
      message:
        'Cette opération touche à votre argent : confirmez votre identité avec votre code ' +
        'PIN ou l’une de vos questions secrètes.',
    });
  }
}
