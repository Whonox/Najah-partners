import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EcardStatus } from '@prisma/client';
import { Money, moneyToApi } from '../common/money';

/**
 * Erreurs métier des e-cards. Comme celles du grand livre et de l'inscription, elles
 * étendent les exceptions HTTP de Nest.
 *
 * RÈGLE : aucun message ne contient JAMAIS le code d'une e-card en clair. Un code est de
 * la valeur au porteur — le renvoyer dans une erreur le ferait fuir dans les logs
 * d'accès, les traces d'erreur et les rapports côté client.
 */

/** Code inconnu (ou saisie erronée) — volontairement indistinct d'une carte inutilisable. */
export class EcardNotFoundError extends NotFoundException {
  constructor() {
    super('E-card introuvable.');
  }
}

/** La carte n'est plus consommable : déjà utilisée, révoquée ou expirée. USED est définitif. */
export class EcardNotActiveError extends ConflictException {
  constructor(status: EcardStatus) {
    const reason: Record<EcardStatus, string> = {
      [EcardStatus.USED]: 'déjà utilisée (une utilisation est définitive)',
      [EcardStatus.REVOKED]: 'révoquée par l’administration',
      [EcardStatus.EXPIRED]: 'expirée',
      [EcardStatus.ACTIVE]: 'active',
    };
    super(`E-card inutilisable : ${reason[status]}.`);
  }
}

/** Échéance dépassée, avant même que le cron ne soit passé la marquer EXPIRED. */
export class EcardExpiredError extends ConflictException {
  constructor() {
    super('E-card expirée.');
  }
}

/**
 * Couverture exacte (spec §5.5, D-007) : ni trop-perçu, ni appoint. Une e-card paie un montant
 * égal, au millime près.
 */
export class EcardValueMismatchError extends ConflictException {
  constructor(valueDt: Money, dueDt: Money) {
    super(
      `Valeur de l’e-card (${moneyToApi(valueDt)} DT) différente du montant dû (${moneyToApi(dueDt)} DT) : ` +
        'une e-card doit couvrir le montant exactement (une seule e-card par transaction).',
    );
  }
}

/**
 * La carte a changé d'état entre la vérification et la consommation (course entre deux
 * utilisations simultanées de la MÊME e-card) : la transaction perdante est annulée.
 */
export class EcardAlreadyConsumedError extends ConflictException {
  constructor() {
    super('E-card consommée entre-temps par une autre opération.');
  }
}

/** Un membre ne prolonge que SES e-cards (D-026) ; l'admin prolonge les autres. */
export class EcardNotOwnedError extends ForbiddenException {
  constructor() {
    super('Cette e-card n’a pas été créée par vous.');
  }
}

/** Une e-card sans échéance n'a rien à prolonger. */
export class EcardAlreadyUnlimitedError extends BadRequestException {
  constructor() {
    super(
      'Cette e-card n’expire jamais : il n’y a pas d’échéance à repousser.',
    );
  }
}

/** Durée de validité invalide fournie par l'admin à la genèse (-1, ou un entier > 0). */
export class InvalidExpirationDaysError extends BadRequestException {
  constructor(days: number) {
    super(
      `Durée de validité invalide : ${days} (attendu : -1 pour illimité, ou un entier > 0).`,
    );
  }
}

/** Paramètre `ecard_expiration_days` corrompu : -1 (illimité) ou un nombre de jours > 0. */
export class InvalidExpirationSettingError extends InternalServerErrorException {
  constructor(value: string) {
    super(
      `Paramètre ecard_expiration_days invalide : "${value}" (attendu : -1 pour illimité, ou un entier > 0).`,
    );
  }
}
