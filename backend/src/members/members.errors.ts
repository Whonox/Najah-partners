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
