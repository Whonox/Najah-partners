import { Injectable } from '@nestjs/common';
import { BvMovementType, MemberStatus, Prisma } from '@prisma/client';
import { BvLedgerService } from '../bv-ledger/bv-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  InvalidSettingError,
  MemberNotFoundError,
  MemberNotRegisteredError,
  PackUnavailableError,
} from './members.errors';
import {
  ActivationPayment,
  ActivationResult,
  ActivationSnapshot,
} from './members.types';
import { BalanceActivationPayment } from './payment/balance-activation-payment';
import { PlacementService } from './placement.service';

const TX_TIMEOUT_MS = 15_000;
const STARTUP_BONUS_SETTING = 'startup_bonus_default';
const DEFAULT_STARTUP_BONUS = 6;
/** Échouer proprement plutôt que d'attendre indéfiniment un verrou de branche. */
const LOCK_TIMEOUT = "SET LOCAL lock_timeout = '3s'";

export interface ActivateInput {
  memberId: number;
  packId: number;
  /** Moyen de paiement (Tranche 5 : e-card). Défaut : le solde BV déjà approvisionné. */
  payment?: ActivationPayment;
}

/**
 * Activation INSCRIT → ACTIF (spec §5.3, §5.4, §9.1) : la SEULE opération qui injecte du BV
 * dans l'arbre. Tout se fait dans une transaction unique — statut, snapshot, débit BV,
 * baseline et propagation committent ensemble ou pas du tout.
 *
 * Aucune route HTTP n'expose ce service (D-023) : la seule porte d'entrée en ACTIF est
 * l'achat par e-card finalisé, qui sera branché ici en Tranche 5/6.
 */
@Injectable()
export class ActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: BvLedgerService,
    private readonly placement: PlacementService,
    private readonly defaultPayment: BalanceActivationPayment,
  ) {}

  async activate(input: ActivateInput): Promise<ActivationResult> {
    const payment = input.payment ?? this.defaultPayment;
    // Hors transaction : rien de coûteux ni de faillible sous verrou.
    const startupBonus = await this.startupBonusDefault();

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(LOCK_TIMEOUT);

        // 1. VERROU ORDONNÉ (D-024) — première instruction touchant `Member` : le membre et
        //    tous ses ancêtres, par id croissant. Aucun autre verrou ne doit être pris avant.
        const chain = await this.placement.lockChainInTx(tx, input.memberId);

        // 2. Relecture du statut SOUS VERROU : garde d'idempotence (double soumission, retry).
        const member = await tx.member.findUnique({
          where: { id: input.memberId },
          select: { id: true, memberCode: true, status: true },
        });
        if (!member) {
          throw new MemberNotFoundError(input.memberId);
        }
        if (member.status !== MemberStatus.REGISTERED) {
          throw new MemberNotRegisteredError(member.id, member.status);
        }

        // 3. SNAPSHOT du pack (spec §5.8) : à partir d'ici, plus rien ne relit Pack. Modifier
        //    un palier demain ne réécrira pas cette activation.
        const pack = await tx.pack.findUnique({ where: { id: input.packId } });
        if (!pack || !pack.active) {
          throw new PackUnavailableError(input.packId);
        }
        const snapshot: ActivationSnapshot = {
          packName: pack.name,
          tierBv: pack.tierBv,
          directCommissionBv: pack.directCommissionBv,
          indirectCommissionBv: pack.indirectCommissionBv,
          weeklyCapBv: pack.weeklyCapBv,
        };

        // 4. Moyen de paiement (point d'extension e-card, Tranche 5) : à sa sortie, le solde
        //    doit couvrir le palier.
        await payment.settleInTx(tx, {
          memberId: member.id,
          amountBv: snapshot.tierBv,
        });

        // 5. Débit du palier — via le grand livre, seul point d'écriture des soldes (D-017).
        //    Solde insuffisant → InsufficientBalanceError → toute l'activation est annulée.
        const entry = await this.ledger.recordMovementInTx(tx, {
          memberId: member.id,
          type: BvMovementType.ACTIVATION,
          amountBv: -snapshot.tierBv,
        });

        // 6. Passage à ACTIF + baseline figée. `baselineLeft = leftPoints` est calculé EN SQL,
        //    sous verrou : les points accumulés pendant la phase INSCRIT sont ainsi exclus des
        //    commissions propres du membre (§5.8), sans lecture-modification-écriture côté JS.
        //    `WHERE status = 'REGISTERED'` : dernier rempart contre une double activation.
        const updated = await tx.$queryRaw<
          Array<{ baselineLeft: number; baselineRight: number }>
        >`
          UPDATE "Member"
          SET "status" = 'ACTIVE'::"MemberStatus",
              "packId" = ${input.packId},
              "activatedAt" = now(),
              "activationTierBv" = ${snapshot.tierBv},
              "activationSnapshot" = ${JSON.stringify(snapshot)}::jsonb,
              "baselineLeft" = "leftPoints",
              "baselineRight" = "rightPoints",
              "startupBonusRemaining" = ${startupBonus},
              "updatedAt" = now()
          WHERE "id" = ${member.id}
            AND "status" = 'REGISTERED'::"MemberStatus"
          RETURNING "baselineLeft", "baselineRight"
        `;
        if (updated.length !== 1) {
          throw new MemberNotRegisteredError(member.id, member.status);
        }

        // 7. Propagation du palier SNAPSHOTÉ à tous les ancêtres, sur la bonne jambe (D-020).
        await this.placement.propagateInTx(
          tx,
          member.id,
          snapshot.tierBv,
          chain.ancestorCount,
        );

        await tx.auditLog.create({
          data: {
            actor: 'SYSTEM',
            action: 'MEMBER_ACTIVATED',
            target: `Member:${member.id}`,
            before: { status: MemberStatus.REGISTERED },
            after: {
              status: MemberStatus.ACTIVE,
              packId: input.packId,
              snapshot: snapshot as unknown as Prisma.JsonObject,
              baselineLeft: updated[0].baselineLeft,
              baselineRight: updated[0].baselineRight,
              creditedAncestors: chain.ancestorCount,
              ledgerEntryId: entry.id,
            },
          },
        });

        return {
          memberId: member.id,
          memberCode: member.memberCode,
          packId: input.packId,
          snapshot,
          baselineLeft: updated[0].baselineLeft,
          baselineRight: updated[0].baselineRight,
          startupBonusRemaining: startupBonus,
          creditedAncestors: chain.ancestorCount,
          ledgerEntryId: entry.id,
        };
      },
      { timeout: TX_TIMEOUT_MS },
    );
  }

  /** Réserve de bonus de démarrage figée à l'activation (défaut 6, paramétrable — D-012). */
  private async startupBonusDefault(): Promise<number> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: STARTUP_BONUS_SETTING },
    });
    if (!setting) {
      return DEFAULT_STARTUP_BONUS;
    }
    const value = Number(setting.value);
    if (!Number.isInteger(value) || value < 0) {
      // Un paramètre corrompu écrirait NaN en base : mieux vaut refuser l'activation.
      throw new InvalidSettingError(STARTUP_BONUS_SETTING, setting.value);
    }
    return value;
  }
}
