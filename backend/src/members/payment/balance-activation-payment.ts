import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivationPayment } from '../members.types';

/**
 * Moyen de paiement de la Tranche 4 : le solde BV du membre doit DÉJÀ couvrir le palier
 * (approvisionné par une genèse ou un ajustement admin — grand livre, Tranche 3).
 *
 * Ne écrit rien, volontairement : le débit ACTIVATION qui suit lèvera lui-même
 * `InsufficientBalanceError` si le solde ne suffit pas, sous le verrou de ligne du grand
 * livre — le contrôle est donc fait une seule fois, au seul endroit qui fait autorité.
 *
 * La Tranche 5 branchera ici l'implémentation e-card : brûler la carte et créditer
 * ECARD_USE (+palier) dans la MÊME transaction, juste avant le débit.
 */
@Injectable()
export class BalanceActivationPayment implements ActivationPayment {
  async settleInTx(
    _tx: Prisma.TransactionClient,
    _input: { memberId: number; amountBv: number },
  ): Promise<void> {
    // Rien à régler : les fonds sont déjà sur le solde.
  }
}
