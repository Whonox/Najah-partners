import { Injectable } from '@nestjs/common';
import { BvLedgerEntry, BvMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BvLedgerService } from './bv-ledger.service';

const TX_TIMEOUT_MS = 10_000;

/**
 * Cas d'usage admin du grand livre : ajustement manuel et genèse de BV.
 * Chaque opération écrit le mouvement (via le moteur de solde) ET une ligne
 * AuditLog dans la MÊME transaction — mouvement et trace committent ensemble.
 */
@Injectable()
export class BvAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: BvLedgerService,
  ) {}

  /** Ajustement manuel (montant signé), motif obligatoire (imposé par le moteur). */
  async adjust(params: {
    adminId: number;
    memberId: number;
    amountBv: number;
    reason: string;
  }): Promise<BvLedgerEntry> {
    return this.runTraced({
      ...params,
      type: BvMovementType.ADMIN_ADJUSTMENT,
      action: 'BV_ADMIN_ADJUSTMENT',
    });
  }

  /** Genèse de BV (amorçage / promo), crédit positif validé par le DTO. */
  async genesis(params: {
    adminId: number;
    memberId: number;
    amountBv: number;
    reason?: string;
  }): Promise<BvLedgerEntry> {
    return this.runTraced({
      ...params,
      type: BvMovementType.ADMIN_GENESIS,
      action: 'BV_ADMIN_GENESIS',
    });
  }

  private async runTraced(params: {
    adminId: number;
    memberId: number;
    amountBv: number;
    reason?: string;
    type: BvMovementType;
    action: string;
  }): Promise<BvLedgerEntry> {
    return this.prisma.$transaction(
      async (tx) => {
        const entry = await this.ledger.recordMovementInTx(tx, {
          memberId: params.memberId,
          type: params.type,
          amountBv: params.amountBv,
          reason: params.reason,
        });
        await tx.auditLog.create({
          data: {
            actor: String(params.adminId),
            action: params.action,
            target: `Member:${params.memberId}`,
            before: { bvBalance: entry.balanceAfter - entry.amountBv },
            after: {
              bvBalance: entry.balanceAfter,
              amountBv: entry.amountBv,
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
