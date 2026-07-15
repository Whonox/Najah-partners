import { Prisma } from '@prisma/client';
import { Money } from '../../common/money';
import {
  ActivationPayment,
  SettlementResult,
} from '../../members/members.types';
import type { EcardsService } from '../ecards.service';

/**
 * Règlement de l'activation PAR E-CARD (D-025) — l'implémentation que la Tranche 4 laissait
 * en attente derrière l'interface `ActivationPayment`.
 *
 * La carte est brûlée dans la transaction d'activation : elle passe `USED` si et seulement si
 * l'activation committe entièrement (statut, snapshot, baseline, propagation d'arbre). Une
 * activation interrompue la laisse `ACTIVE` (spec §5.4) — garanti par le rollback Postgres.
 *
 * AUCUN mouvement de solde : la valeur de l'e-card paie le PRIX DU PACK (en dinars — D-029),
 * elle ne transite pas par le solde du membre (qui reste à zéro s'il n'a jamais rien gagné). Le
 * membre n'est donc jamais débité — il n'y a rien à débiter.
 *
 * Objet à usage unique (il porte le code d'UNE carte) : instancié par
 * `EcardsService.activationPayment(code)`, jamais un provider Nest partagé.
 */
export class EcardActivationPayment implements ActivationPayment {
  constructor(
    private readonly ecards: EcardsService,
    private readonly code: string,
  ) {}

  async settleInTx(
    tx: Prisma.TransactionClient,
    input: { memberId: number; amountDt: Money },
  ): Promise<SettlementResult> {
    // La valeur doit couvrir le prix du pack EXACTEMENT (spec §5.5, D-007) ; `consumeInTx` le
    // vérifie et refuse toute carte inactive, expirée ou de valeur différente.
    const consumed = await this.ecards.consumeInTx(tx, {
      code: this.code,
      memberId: input.memberId,
      dueDt: input.amountDt,
    });

    return { method: 'ECARD', ledgerEntryId: null, ecardId: consumed.ecardId };
  }
}
