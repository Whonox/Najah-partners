import { Injectable } from '@nestjs/common';
import { LedgerEntry, LedgerMovementType } from '@prisma/client';
import { Money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

const TX_TIMEOUT_MS = 10_000;

/**
 * Cas d'usage admin du grand livre : ajustement manuel et genèse de solde. Les deux sont en
 * DINARS (D-028) — un admin crédite de l'argent, jamais des points (les points n'entrent dans
 * l'arbre que par une activation, D-005).
 *
 * Chaque opération écrit le mouvement (via le moteur de solde) ET une ligne AuditLog dans la
 * MÊME transaction — mouvement et trace committent ensemble.
 */
@Injectable()
export class LedgerAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /** Ajustement manuel (montant signé, en DT), motif obligatoire (imposé par le moteur). */
  async adjust(params: {
    adminId: number;
    memberId: number;
    amountDt: Money;
    reason: string;
  }): Promise<LedgerEntry> {
    return this.runTraced({
      ...params,
      type: LedgerMovementType.ADMIN_ADJUSTMENT,
      action: 'LEDGER_ADMIN_ADJUSTMENT',
    });
  }

  /** Genèse de solde en DT (amorçage / promo), crédit positif validé par le DTO. */
  async genesis(params: {
    adminId: number;
    memberId: number;
    amountDt: Money;
    reason?: string;
  }): Promise<LedgerEntry> {
    return this.runTraced({
      ...params,
      type: LedgerMovementType.ADMIN_GENESIS,
      action: 'LEDGER_ADMIN_GENESIS',
    });
  }

  private async runTraced(params: {
    adminId: number;
    memberId: number;
    amountDt: Money;
    reason?: string;
    type: LedgerMovementType;
    action: string;
  }): Promise<LedgerEntry> {
    return this.prisma.$transaction(
      async (tx) => {
        const entry = await this.ledger.recordMovementInTx(tx, {
          memberId: params.memberId,
          type: params.type,
          amountDt: params.amountDt,
          reason: params.reason,
        });
        await tx.auditLog.create({
          data: {
            actor: String(params.adminId),
            action: params.action,
            target: `Member:${params.memberId}`,
            // Montants sérialisés en TEXTE : l'audit passe par du JSON, et un Decimal qui
            // traverse un flottant peut revenir faux au millime près.
            before: {
              balanceDt: moneyToApi(entry.balanceAfterDt.minus(entry.amountDt)),
            },
            after: {
              balanceDt: moneyToApi(entry.balanceAfterDt),
              amountDt: moneyToApi(entry.amountDt),
              reason: params.reason ?? null,
              ledgerEntryId: entry.id,
            },
          },
        });
        return entry;
      },
      { timeout: TX_TIMEOUT_MS },
    );
  }
}
