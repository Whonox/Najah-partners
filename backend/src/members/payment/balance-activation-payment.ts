import { Injectable } from '@nestjs/common';
import { BvMovementType, Prisma } from '@prisma/client';
import { BvLedgerService } from '../../bv-ledger/bv-ledger.service';
import { SettlementResult } from '../members.types';

/**
 * Règlement sur le SOLDE BV du membre : le palier est débité de son solde (mouvement
 * ACTIVATION), qui doit donc déjà être approvisionné (genèse ou ajustement admin —
 * grand livre, Tranche 3). C'est la voie du seed et des tests.
 *
 * Le débit passe par le grand livre, seul point d'écriture des soldes (D-017) : si le
 * solde ne couvre pas le palier, `InsufficientBalanceError` est levée SOUS le verrou de
 * ligne et toute l'activation est annulée.
 *
 * La voie normale d'un membre réel est l'e-card (`EcardActivationPayment`, D-025), qui ne
 * touche aucun solde.
 */
@Injectable()
export class BalanceActivationPayment {
  constructor(private readonly ledger: BvLedgerService) {}

  async settleInTx(
    tx: Prisma.TransactionClient,
    input: { memberId: number; amountBv: number },
  ): Promise<SettlementResult> {
    const entry = await this.ledger.recordMovementInTx(tx, {
      memberId: input.memberId,
      type: BvMovementType.ACTIVATION,
      amountBv: -input.amountBv,
    });
    return { method: 'BALANCE', ledgerEntryId: entry.id, ecardId: null };
  }
}
