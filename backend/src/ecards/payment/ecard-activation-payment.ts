import { Prisma } from '@prisma/client';
import { Money } from '../../common/money';
import {
  ActivationPayment,
  SettlementResult,
} from '../../members/members.types';
import type { EcardsService } from '../ecards.service';

/**
 * Règlement de l'activation PAR E-CARD(S) (D-025) — l'implémentation que la Tranche 4 laissait
 * en attente derrière l'interface `ActivationPayment`.
 *
 * Les cartes sont brûlées dans la transaction d'activation : elles passent `USED` si et
 * seulement si l'activation committe entièrement (statut, snapshot, baseline, propagation
 * d'arbre). Une activation interrompue les laisse toutes `ACTIVE` (spec §5.4) — garanti par le
 * rollback Postgres.
 *
 * AUCUN mouvement de solde : la valeur des e-cards paie le montant dû (en dinars — D-029 et
 * D-037 : prix du pack MOINS l'acompte d'inscription), elle ne transite pas par le solde du
 * membre (qui reste à zéro s'il n'a jamais rien gagné). Le membre n'est donc jamais débité —
 * il n'y a rien à débiter.
 *
 * Plusieurs cartes sont cumulables (D-030), leur somme devant couvrir le montant EXACTEMENT :
 * à 2100 DT dus pour un Silver, exiger une carte unique de valeur pile rendrait l'activation
 * impraticable — les gains, eux, arrivent par petits montants.
 *
 * Objet à usage unique (il porte les codes d'UN paiement) : instancié par
 * `EcardsService.activationPayment(codes)`, jamais un provider Nest partagé.
 */
export class EcardActivationPayment implements ActivationPayment {
  constructor(
    private readonly ecards: EcardsService,
    private readonly codes: string[],
  ) {}

  async settleInTx(
    tx: Prisma.TransactionClient,
    input: { memberId: number; amountDt: Money },
  ): Promise<SettlementResult> {
    // La SOMME des valeurs doit couvrir le montant dû EXACTEMENT (spec §5.5, D-007/D-030) ;
    // `consumeManyInTx` le vérifie et refuse toute carte inactive, expirée ou en double.
    const consumed = await this.ecards.consumeManyInTx(tx, {
      codes: this.codes,
      memberId: input.memberId,
      dueDt: input.amountDt,
    });

    return {
      method: 'ECARD',
      ledgerEntryId: null,
      ecardIds: consumed.ecardIds,
    };
  }
}
