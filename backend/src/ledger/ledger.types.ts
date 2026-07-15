import { LedgerEntry, LedgerMovementType } from '@prisma/client';
import { Money } from '../common/money';

/**
 * Entrée d'un mouvement de solde. Le grand livre est le journal des SOLDES, donc des DINARS
 * (D-028) : `amountDt` est un montant, jamais des points.
 *
 * `amountDt` est SIGNÉ :
 *   + crédit  (commission, remboursement e-card, genèse admin…)
 *   − débit   (création e-card, activation réglée sur le solde…)
 * `reason` est obligatoire pour ADMIN_ADJUSTMENT (contrôlé dans le service).
 * `ecardId` / `commissionId` tracent la source du mouvement quand elle existe.
 */
export interface RecordMovementInput {
  memberId: number;
  type: LedgerMovementType;
  amountDt: Money;
  reason?: string;
  ecardId?: number;
  commissionId?: number;
}

export interface LedgerHistoryQuery {
  page?: number;
  pageSize?: number;
}

export interface LedgerHistoryPage {
  items: LedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
}
