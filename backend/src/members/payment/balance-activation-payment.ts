import { Injectable } from '@nestjs/common';
import { LedgerMovementType, Prisma } from '@prisma/client';
import { Money } from '../../common/money';
import { LedgerService } from '../../ledger/ledger.service';
import { SettlementResult } from '../members.types';

/**
 * Règlement sur le SOLDE du membre : le montant dû à l'activation (en dinars — le prix du pack
 * MOINS l'acompte d'inscription, D-029 + D-037) est débité de son solde (mouvement
 * ACTIVATION), qui doit donc déjà être approvisionné (genèse ou ajustement admin — grand
 * livre, Tranche 3). C'est la voie du seed et des tests.
 *
 * Le débit passe par le grand livre, seul point d'écriture des soldes (D-017) : si le solde ne
 * couvre pas le prix, `InsufficientBalanceError` est levée SOUS le verrou de ligne et toute
 * l'activation est annulée.
 *
 * La voie normale d'un membre réel est l'e-card (`EcardActivationPayment`, D-025), qui ne
 * touche aucun solde. Les deux règlent le MÊME montant et diffèrent seulement par la
 * provenance de l'argent.
 */
@Injectable()
export class BalanceActivationPayment {
  constructor(private readonly ledger: LedgerService) {}

  async settleInTx(
    tx: Prisma.TransactionClient,
    input: { memberId: number; amountDt: Money },
  ): Promise<SettlementResult> {
    const entry = await this.ledger.recordMovementInTx(tx, {
      memberId: input.memberId,
      type: LedgerMovementType.ACTIVATION,
      amountDt: input.amountDt.negated(),
    });
    return { method: 'BALANCE', ledgerEntryId: entry.id, ecardIds: [] };
  }
}
