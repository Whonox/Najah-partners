import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Money, moneyToApi } from '../common/money';

/**
 * Erreurs métier du grand livre. Elles étendent les exceptions HTTP de Nest (comme AuthService
 * le fait déjà) : le service reste utilisable tel quel derrière un contrôleur, sans filtre
 * d'exception dédié.
 *
 * Tous les montants cités sont en DINARS (D-028) : le grand livre ne connaît que l'argent.
 */

/** Débit qui rendrait le solde négatif — invariant « solde jamais négatif ». */
export class InsufficientBalanceError extends ConflictException {
  constructor(memberId: number, currentBalance: Money, amountDt: Money) {
    super(
      `Solde insuffisant pour le membre ${memberId} : solde ${moneyToApi(currentBalance)} DT, ` +
        `mouvement ${moneyToApi(amountDt)} DT.`,
    );
  }
}

/** ADMIN_ADJUSTMENT sans motif — le motif est obligatoire (rules/ledger.md). */
export class ReasonRequiredError extends BadRequestException {
  constructor() {
    super(
      'Un motif est obligatoire pour un ajustement admin (ADMIN_ADJUSTMENT).',
    );
  }
}

/** Montant de mouvement invalide : non nul, et au millime près (3 décimales max). */
export class InvalidMovementAmountError extends BadRequestException {
  constructor(amountDt: Money) {
    super(
      `Montant de mouvement invalide : ${amountDt.toString()} DT ` +
        '(montant non nul requis, 3 décimales au maximum — le millime).',
    );
  }
}

/** Le membre ciblé par le mouvement / la lecture n'existe pas. */
export class MemberNotFoundError extends NotFoundException {
  constructor(memberId: number) {
    super(`Membre ${memberId} introuvable.`);
  }
}
