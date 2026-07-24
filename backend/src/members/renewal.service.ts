import { Injectable } from '@nestjs/common';
import { MemberStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  InvalidRenewalTransitionError,
  MemberNotFoundError,
} from './members.errors';

const TX_TIMEOUT_MS = 10_000;

/**
 * Gel / réactivation d'un membre (D-010, D-034) — la PARTIE MOTEUR du renouvellement
 * annuel. Le circuit administratif (paiement des 100 DT, validation, file admin) arrive
 * en Tranche 8 : aucune route HTTP ici, seulement la mécanique et ses invariants.
 *
 * GEL (ACTIF → INACTIF) : le membre ne perçoit plus RIEN — ni directe, ni indirecte.
 * Concrètement, il suffit de changer le statut :
 *  - les événements DIRECT écrits pendant le gel naissent `eligible=false` (évalué au
 *    moment de l'événement — temps 1, D-035) et ne seront jamais payés ;
 *  - la propagation cesse de créditer sa POOL appariable (elle ne crédite que les ACTIFS) :
 *    plus aucun équilibre ne peut se former chez lui. Les points TRAVERSENT — cumul à vie
 *    et `activatedDescendants` continuent de monter vers lui et au-delà.
 *
 * RÉACTIVATION (INACTIF → ACTIF) : nouvelle BASELINE figée — les points arrivés pendant
 * le gel ne rapporteront jamais rien (ils ne sont jamais entrés dans la pool) — mais le
 * CARRY-OVER acquis avant le gel est CONSERVÉ : la pool n'est pas touchée.
 *
 * VERROU : une seule ligne `Member` (FOR NO KEY UPDATE, D-024) — le gel se sérialise avec
 * toute activation en cours qui traverserait ce membre : l'éligibilité d'un événement et
 * le statut qui la justifie committent dans un ordre cohérent.
 */
@Injectable()
export class RenewalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Gel : renouvellement annuel échu (constaté par l'admin — T8) ou décision de gestion. */
  async freeze(memberId: number): Promise<void> {
    await this.prisma.$transaction(
      (tx) => this.transitionInTx(tx, memberId, 'FREEZE'),
      { timeout: TX_TIMEOUT_MS },
    );
  }

  /** Réactivation après régularisation validée (T8 pour le circuit complet). */
  async reactivate(memberId: number): Promise<void> {
    await this.prisma.$transaction(
      (tx) => this.transitionInTx(tx, memberId, 'REACTIVATE'),
      { timeout: TX_TIMEOUT_MS },
    );
  }

  private async transitionInTx(
    tx: Prisma.TransactionClient,
    memberId: number,
    kind: 'FREEZE' | 'REACTIVATE',
  ): Promise<void> {
    const expected =
      kind === 'FREEZE' ? MemberStatus.ACTIVE : MemberStatus.INACTIVE;
    const target =
      kind === 'FREEZE' ? MemberStatus.INACTIVE : MemberStatus.ACTIVE;

    // Verrou de ligne AVANT lecture du statut : la transition se sérialise avec les
    // activations qui traversent ce membre (leur chaîne le verrouille aussi, D-024).
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status"::text AS "status"
      FROM "Member"
      WHERE "id" = ${memberId}
      FOR NO KEY UPDATE
    `;
    if (locked.length === 0) {
      throw new MemberNotFoundError(memberId);
    }
    if (locked[0].status !== expected) {
      throw new InvalidRenewalTransitionError(
        memberId,
        locked[0].status,
        expected,
      );
    }

    if (kind === 'FREEZE') {
      await tx.member.update({
        where: { id: memberId },
        data: { status: target },
      });
    } else {
      // Nouvelle baseline (documentaire — la pool n'a rien reçu pendant le gel), calculée
      // EN SQL sous verrou, comme à l'activation. Le carry-over (pools) n'est PAS touché.
      await tx.$executeRaw`
        UPDATE "Member"
        SET "status" = 'ACTIVE'::"MemberStatus",
            "baselineLeft" = "leftPoints",
            "baselineRight" = "rightPoints",
            "renewalAt" = now(),
            "updatedAt" = now()
        WHERE "id" = ${memberId}
      `;
    }

    await tx.auditLog.create({
      data: {
        actor: 'SYSTEM',
        action: kind === 'FREEZE' ? 'MEMBER_FROZEN' : 'MEMBER_REACTIVATED',
        target: `Member:${memberId}`,
        before: { status: expected },
        after: { status: target },
      },
    });
  }
}
