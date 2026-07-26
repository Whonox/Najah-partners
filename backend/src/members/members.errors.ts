import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Leg } from '@prisma/client';

/**
 * Erreurs métier de l'inscription, du placement et de l'activation. Comme celles du
 * grand livre BV, elles étendent les exceptions HTTP de Nest : le service reste
 * utilisable derrière un contrôleur sans filtre d'exception dédié.
 */

/** Position (upline, jambe) déjà prise — pas de spillover : il faut en choisir une autre. */
export class PositionTakenError extends ConflictException {
  constructor(uplineCode: string, leg: Leg) {
    const side = leg === Leg.LEFT ? 'gauche' : 'droite';
    super(
      `La position ${side} sous ${uplineCode} est déjà occupée. Le placement est définitif : choisissez une autre position libre.`,
    );
  }
}

/** Code sponsor inconnu. */
export class SponsorNotFoundError extends NotFoundException {
  constructor(sponsorCode: string) {
    super(`Code sponsor inconnu : ${sponsorCode}.`);
  }
}

/** Code upline de placement inconnu. */
export class UplineNotFoundError extends NotFoundException {
  constructor(uplineCode: string) {
    super(`Code upline de placement inconnu : ${uplineCode}.`);
  }
}

/** L'upline choisi n'est ni le sponsor, ni un membre de son sous-arbre (D-022). */
export class UplineOutsideSponsorTreeError extends BadRequestException {
  constructor(uplineCode: string, sponsorCode: string) {
    super(
      `L'upline ${uplineCode} n'appartient pas au réseau de ${sponsorCode} : un filleul ne peut être placé que sous son sponsor ou sous l'un de ses downlines.`,
    );
  }
}

/** E-mail ou téléphone déjà utilisé par un autre membre. */
export class ContactAlreadyUsedError extends ConflictException {
  constructor(field: 'email' | 'phone') {
    super(
      field === 'email'
        ? 'Cette adresse e-mail est déjà utilisée.'
        : 'Ce numéro de téléphone est déjà utilisé.',
    );
  }
}

/** Ni e-mail ni téléphone : le membre serait impossible à recontacter. */
export class MissingContactError extends BadRequestException {
  constructor() {
    super('Renseignez au moins une adresse e-mail ou un numéro de téléphone.');
  }
}

/** Le membre ciblé n'existe pas. */
export class MemberNotFoundError extends NotFoundException {
  constructor(memberId: number) {
    super(`Membre ${memberId} introuvable.`);
  }
}

/** Activation d'un membre qui n'est pas INSCRIT (déjà actif, ou inactif). */
export class MemberNotRegisteredError extends ConflictException {
  constructor(memberId: number, status: string) {
    super(
      `Le membre ${memberId} n'est pas en état INSCRIT (état actuel : ${status}) : seule une inscription non finalisée peut être activée.`,
    );
  }
}

/** Pack inexistant ou désactivé au moment de l'activation. */
export class PackUnavailableError extends BadRequestException {
  constructor(packId: number) {
    super(`Pack ${packId} inexistant ou désactivé.`);
  }
}

/** Transition de gel/réactivation impossible : le membre n'est pas dans l'état attendu (D-034). */
export class InvalidRenewalTransitionError extends ConflictException {
  constructor(memberId: number, status: string, expected: string) {
    super(
      `Le membre ${memberId} est en état ${status} : cette opération exige l'état ${expected}.`,
    );
  }
}

/**
 * ERREUR VOLONTAIREMENT AVEUGLE — inscription publique et anonyme (D-021, D-036).
 *
 * Un seul message et un seul code HTTP pour TOUTES les causes de refus du paiement : code
 * inexistant, déjà utilisé, révoqué, expiré, total inférieur, total supérieur, doublon. Le
 * distinguo serait un oracle : un attaquant anonyme énumérerait l'espace des codes en lisant
 * la différence entre « inconnu » et « déjà utilisée », et découvrirait au passage la valeur
 * des cartes des autres. La valeur d'une e-card n'est JAMAIS renvoyée ici.
 *
 * Sur les endpoints AUTHENTIFIÉS (renouvellement, checkout), on garde à l'inverse les erreurs
 * précises des e-cards : le tâtonnement y est nominatif, traçable et attribuable.
 */
export class RegistrationPaymentRefusedError extends ConflictException {
  constructor() {
    super({
      statusCode: 409,
      // Le portail s'en sert pour ramener l'affilié à l'ÉTAPE DES E-CARDS plutôt que de lui
      // afficher une erreur générique en bas d'un récapitulatif. Le code dit QUELLE étape
      // reprendre — jamais quel code est en cause.
      code: 'REGISTRATION_PAYMENT_REFUSED',
      // ═══ DIRE QUOI REPRENDRE, SANS DIRE POURQUOI ═══
      // Ce message est lu par un affilié qui vient de saisir quatre écrans : lui répondre
      // « une erreur est survenue » l'obligerait à tout revérifier. On nomme donc l'étape
      // concernée, et on le rassure sur le sort de ses cartes — c'est sa première inquiétude.
      //
      // Ce qu'on ne dit toujours PAS, et c'est l'essentiel : LEQUEL des codes pose problème,
      // s'il existe, s'il est déjà utilisé, s'il est expiré, ni ce qu'il vaut. Sept causes
      // distinctes rendent ce message unique (voir `PAYMENT_REFUSAL_ERRORS`). Distinguer,
      // fût-ce d'un mot, ferait de l'inscription un oracle sur de la valeur au porteur — et
      // c'est précisément ce que D-052 refuse pour un formulaire public et anonyme.
      //
      // ═══ LE MONTANT N'EST PAS DANS LE MESSAGE, ET C'EST DÉLIBÉRÉ ═══
      // Il y figurait ; l'écran affichait alors « les frais d'inscription (100.000 DT) ». En
      // français, « 100.000 » se lit CENT MILLE — le point sépare les milliers, la virgule les
      // décimales. Un affilié pouvait croire devoir cent mille dinars. Le montant est de toute
      // façon affiché à l'écran, formaté selon la locale ; le serveur, lui, n'en connaît
      // aucune et n'a donc pas à mettre en forme des chiffres destinés à être lus.
      message:
        `Vérifiez vos codes d'e-card : leur total doit couvrir exactement les frais ` +
        `d'inscription, et chaque carte doit être encore utilisable. ` +
        `Aucune de vos cartes n'a été consommée.`,
    });
  }
}

/**
 * Paramètre de montant d'adhésion (`registration_fee_dt`, `annual_renewal_dt`) absent ou
 * corrompu. 500 et non 400 : ce n'est pas la saisie de l'utilisateur qui est en cause, et
 * facturer un montant faux vaut moins que ne rien facturer du tout.
 */
export class InvalidMembershipFeeSettingError extends InternalServerErrorException {
  constructor(key: string, value: string | null) {
    super(
      `Paramètre ${key} invalide : ${value === null ? 'absent' : `"${value}"`} ` +
        '(attendu : un montant en DT strictement positif, au millime).',
    );
  }
}

/**
 * L'acompte d'inscription couvre (ou dépasse) le prix du pack : le montant dû serait nul ou
 * négatif. Activer gratuitement ferait entrer des points dans l'arbre sans contrepartie — on
 * annule plutôt que d'écrire un trou comptable.
 */
export class ActivationAmountInvalidError extends ConflictException {
  constructor(priceDt: string, creditDt: string) {
    super(
      `Montant dû à l'activation invalide : prix du pack ${priceDt} DT − acompte ` +
        `d'inscription ${creditDt} DT. L'acompte ne peut pas couvrir le pack.`,
    );
  }
}

/** Un INSCRIT n'a jamais activé : il n'a rien à renouveler (D-010). */
export class NothingToRenewError extends ConflictException {
  constructor(memberId: number, status: string) {
    super(
      `Le membre ${memberId} est en état ${status} : seul un membre ayant activé (ACTIVE ou ` +
        'INACTIVE) peut renouveler son adhésion.',
    );
  }
}

/** Un renouvellement déjà payé attend l'admin : en repayer un second brûlerait des e-cards pour rien. */
export class RenewalAlreadyPendingError extends ConflictException {
  constructor(paymentId: number) {
    super(
      `Un renouvellement (#${paymentId}) est déjà payé et en attente de validation par ` +
        'l’administration. Inutile d’en régler un second.',
    );
  }
}

/** Paiement de renouvellement introuvable, ou déjà validé (la validation n'est pas rejouable). */
export class RenewalPaymentNotPendingError extends ConflictException {
  constructor(paymentId: number) {
    super(
      `Le renouvellement #${paymentId} est introuvable ou n'est plus en attente de validation.`,
    );
  }
}

/** Pièce d'identité refusée (type de fichier ou taille). */
export class InvalidIdDocumentError extends BadRequestException {
  constructor(reason: string) {
    super(`Pièce d'identité refusée : ${reason}`);
  }
}

/**
 * La remontée d'arbre n'a pas atteint la racine (garde-fou de profondeur atteint), ou
 * le nombre d'ancêtres crédités ne correspond pas au chemin verrouillé. Une propagation
 * tronquée qui committerait serait une corruption comptable irréversible → rollback.
 */
export class TreeTruncatedError extends InternalServerErrorException {
  constructor(memberId: number, detail: string) {
    super(
      `Remontée d'arbre incohérente pour le membre ${memberId} (${detail}) : activation annulée.`,
    );
  }
}

/**
 * Refus de la vérification PRÉALABLE de parrainage et de placement (D-052, précisée par D-061).
 *
 * ═══ UN SEUL MESSAGE POUR QUATRE CAUSES, ET C'EST TOUT L'OBJET ═══
 * Sponsor inconnu, upline inconnu, upline hors du réseau du sponsor (D-022), position déjà
 * occupée : la réponse est IDENTIQUE. Cette route est publique et anonyme (D-021) ; distinguer
 * les causes en ferait un annuaire interrogeable — « ce code existe-t-il ? », « cette place
 * est-elle libre ? » — alors qu'elle n'a qu'une question légitime à traiter : « ce parrainage
 * est-il utilisable ? »
 *
 * ═══ CE QU'ELLE APPORTE MALGRÉ TOUT ═══
 * Le futur affilié apprend à l'ÉTAPE 3 que son parrainage ne passe pas, et non à l'étape 4
 * après avoir saisi ses codes d'e-card. C'était le défaut relevé à la validation : on ne
 * découvre pas une erreur de code après avoir composé un paiement.
 *
 * ═══ CE QU'ELLE NE FAIT PAS ═══
 * Elle ne réserve rien. La position peut être prise entre cette vérification et l'inscription
 * — c'est la transaction d'inscription qui tranche, sous contrainte de base (D-036).
 */
export class PlacementCheckRefusedError extends BadRequestException {
  constructor() {
    super({
      statusCode: 400,
      code: 'PLACEMENT_REFUSED',
      message:
        'Ces informations de parrainage sont incorrectes. Vérifiez le code de votre parrain, ' +
        'celui de votre upline de placement et la jambe choisie auprès de la personne qui ' +
        'vous a invité.',
    });
  }
}
