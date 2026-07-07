import { BvLedgerEntry, BvMovementType } from '@prisma/client';

/**
 * Entrée d'un mouvement de solde. `amountBv` est SIGNÉ :
 *   + crédit  (commission, remboursement e-card, genèse admin…)
 *   − débit   (création e-card, consommation à l'activation…)
 * `reason` est obligatoire pour ADMIN_ADJUSTMENT (contrôlé dans le service).
 * `ecardId` / `commissionId` tracent la source du mouvement quand elle existe.
 */
export interface RecordMovementInput {
  memberId: number;
  type: BvMovementType;
  amountBv: number;
  reason?: string;
  ecardId?: number;
  commissionId?: number;
}

export interface BvHistoryQuery {
  page?: number;
  pageSize?: number;
}

export interface BvHistoryPage {
  items: BvLedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
}
