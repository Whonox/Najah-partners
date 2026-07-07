import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

/**
 * Erreurs métier du grand livre BV. Elles étendent les exceptions HTTP de Nest
 * (comme AuthService le fait déjà) : le service reste utilisable tel quel derrière
 * un contrôleur, sans filtre d'exception dédié.
 */

/** Débit qui rendrait le solde négatif — invariant « solde jamais négatif ». */
export class InsufficientBalanceError extends ConflictException {
  constructor(memberId: number, currentBalance: number, amountBv: number) {
    super(
      `Solde BV insuffisant pour le membre ${memberId} : solde ${currentBalance}, mouvement ${amountBv}.`,
    );
  }
}

/** ADMIN_ADJUSTMENT sans motif — le motif est obligatoire (bv-ledger.md). */
export class ReasonRequiredError extends BadRequestException {
  constructor() {
    super(
      'Un motif est obligatoire pour un ajustement admin (ADMIN_ADJUSTMENT).',
    );
  }
}

/** Montant de mouvement invalide (doit être un entier non nul). */
export class InvalidMovementAmountError extends BadRequestException {
  constructor(amountBv: number) {
    super(
      `Montant de mouvement BV invalide : ${amountBv} (entier non nul requis).`,
    );
  }
}

/** Le membre ciblé par le mouvement / la lecture n'existe pas. */
export class MemberNotFoundError extends NotFoundException {
  constructor(memberId: number) {
    super(`Membre ${memberId} introuvable.`);
  }
}
