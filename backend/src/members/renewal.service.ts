import { Injectable } from '@nestjs/common';
import {
  MemberStatus,
  MembershipPaymentStatus,
  MembershipPaymentType,
  Prisma,
} from '@prisma/client';
import { moneyToApi } from '../common/money';
import { EcardsService } from '../ecards/ecards.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ANNUAL_RENEWAL_SETTING,
  MembershipFeeService,
} from './membership-fee.service';
import {
  InvalidRenewalTransitionError,
  MemberNotFoundError,
  NothingToRenewError,
  RenewalAlreadyPendingError,
  RenewalPaymentNotPendingError,
} from './members.errors';
import { MembershipPaymentView } from './members.types';

const TX_TIMEOUT_MS = 10_000;

/** Un paiement d'adhésion tel qu'on le renvoie : membre + e-cards brûlées (leurs ids). */
const PAYMENT_INCLUDE = {
  member: { select: { memberCode: true } },
  ecards: { select: { id: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.MembershipPaymentInclude;

type PaymentWithRelations = Prisma.MembershipPaymentGetPayload<{
  include: typeof PAYMENT_INCLUDE;
}>;

/**
 * Renouvellement annuel : paiement, validation, gel / réactivation (D-010, D-034, D-038).
 *
 * DEUX TEMPS, ET C'EST TOUT L'INTÉRÊT (D-038) — payer ne dégèle pas.
 *  1. `pay()` — le membre règle les 100 DT par e-card(s) (total exact, cumulables — D-030).
 *     Son statut ne bouge PAS : un gelé reste gelé, ne perçoit toujours rien. Le paiement
 *     naît `PENDING_VALIDATION`.
 *  2. `validate()` — l'admin constate la régularisation. C'est LUI qui réactive
 *     (contrairement à l'inscription initiale, automatique — D-010). L'écran de la file
 *     d'attente arrive en Tranche 8 ; ici, le service et l'endpoint minimal.
 *
 * Qui peut payer : un ACTIF (renouvellement anticipé — la validation ne fait alors que
 * repousser l'échéance) comme un INACTIF (régularisation — la validation le réactive). Un
 * INSCRIT est refusé : il n'a jamais activé, il n'a rien à renouveler.
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
 * VERROUILLAGE (D-024) : `Member` (une seule ligne, `FOR NO KEY UPDATE`) puis `Ecard` (ids
 * croissants). Le verrou du membre sérialise la transition avec toute activation en cours qui
 * traverserait ce membre — l'éligibilité d'un événement et le statut qui la justifie
 * committent dans un ordre cohérent — et il sérialise aussi deux paiements concurrents : le
 * second voit le premier en attente et est refusé au lieu de brûler des cartes pour rien.
 */
@Injectable()
export class RenewalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: MembershipFeeService,
    private readonly ecards: EcardsService,
  ) {}

  // ─────────────────────────── Temps 1 : le membre paie ───────────────────────────

  /**
   * Règle le renouvellement annuel par e-card(s) (D-038). Le statut du membre est INCHANGÉ :
   * le paiement seul ne réactive rien, il ouvre une demande que l'admin validera.
   *
   * Erreurs PRÉCISES, contrairement à l'inscription : l'endpoint est authentifié, un
   * tâtonnement sur les codes y est nominatif et traçable — il n'y a pas d'oracle anonyme à
   * refermer, et le membre a droit à un message utile.
   */
  async pay(input: {
    memberId: number;
    ecardCodes: string[];
  }): Promise<MembershipPaymentView> {
    const dueDt = await this.fees.read(ANNUAL_RENEWAL_SETTING);

    return this.prisma.$transaction(
      async (tx) => {
        // Verrou de ligne AVANT toute lecture : deux paiements simultanés se sérialisent, et
        // le second verra le premier déjà en attente.
        const locked = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT "status"::text AS "status"
          FROM "Member"
          WHERE "id" = ${input.memberId}
          FOR NO KEY UPDATE
        `;
        if (locked.length === 0) {
          throw new MemberNotFoundError(input.memberId);
        }
        const status = locked[0].status as MemberStatus;
        if (
          status !== MemberStatus.ACTIVE &&
          status !== MemberStatus.INACTIVE
        ) {
          throw new NothingToRenewError(input.memberId, status);
        }

        const pending = await tx.membershipPayment.findFirst({
          where: {
            memberId: input.memberId,
            type: MembershipPaymentType.RENEWAL,
            status: MembershipPaymentStatus.PENDING_VALIDATION,
          },
          select: { id: true },
        });
        if (pending) {
          throw new RenewalAlreadyPendingError(pending.id);
        }

        const payment = await tx.membershipPayment.create({
          data: {
            memberId: input.memberId,
            type: MembershipPaymentType.RENEWAL,
            status: MembershipPaymentStatus.PENDING_VALIDATION,
            amountDt: dueDt,
          },
          select: { id: true },
        });

        const consumed = await this.ecards.consumeManyInTx(tx, {
          codes: input.ecardCodes,
          memberId: input.memberId,
          dueDt,
          membershipPaymentId: payment.id,
        });

        await tx.auditLog.create({
          data: {
            actor: `Member:${input.memberId}`,
            action: 'RENEWAL_PAID',
            target: `MembershipPayment:${payment.id}`,
            after: {
              memberStatus: status, // inchangé : payer ne dégèle pas (D-038)
              amountDt: moneyToApi(dueDt),
              ecardIds: consumed.ecardIds, // jamais les codes en clair
            },
          },
        });

        return this.toView(
          await tx.membershipPayment.findUniqueOrThrow({
            where: { id: payment.id },
            include: PAYMENT_INCLUDE,
          }),
        );
      },
      { timeout: TX_TIMEOUT_MS },
    );
  }

  // ─────────────────────────── Temps 2 : l'admin valide ───────────────────────────

  /**
   * Valide un renouvellement payé et régularise le membre (D-038) : réactivation si le membre
   * est gelé (avec la mécanique D-034 déjà en place — nouvelle baseline, carry-over conservé),
   * simple report d'échéance s'il était encore ACTIF.
   *
   * L'`UPDATE` gardé sur `PENDING_VALIDATION` rend l'opération non rejouable : deux admins qui
   * valident en même temps ne peuvent pas réactiver deux fois ni figer deux baselines.
   */
  async validate(input: {
    paymentId: number;
    adminId: number;
  }): Promise<MembershipPaymentView> {
    return this.prisma.$transaction(
      async (tx) => {
        // Lecture non verrouillante juste pour connaître le membre : c'est LUI qu'on
        // verrouille en premier (D-024), avant de revendiquer le paiement.
        const target = await tx.membershipPayment.findUnique({
          where: { id: input.paymentId },
          select: { id: true, memberId: true, status: true, type: true },
        });
        if (
          !target ||
          target.type !== MembershipPaymentType.RENEWAL ||
          target.status !== MembershipPaymentStatus.PENDING_VALIDATION
        ) {
          throw new RenewalPaymentNotPendingError(input.paymentId);
        }

        const locked = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT "status"::text AS "status"
          FROM "Member"
          WHERE "id" = ${target.memberId}
          FOR NO KEY UPDATE
        `;
        if (locked.length === 0) {
          throw new MemberNotFoundError(target.memberId);
        }
        const status = locked[0].status as MemberStatus;

        const claimed = await tx.$queryRaw<Array<{ id: number }>>`
          UPDATE "MembershipPayment"
          SET "status" = 'VALIDATED'::"MembershipPaymentStatus",
              "validatedAt" = now(),
              "validatedByAdminId" = ${input.adminId}
          WHERE "id" = ${input.paymentId}
            AND "status" = 'PENDING_VALIDATION'::"MembershipPaymentStatus"
          RETURNING "id"
        `;
        if (claimed.length !== 1) {
          throw new RenewalPaymentNotPendingError(input.paymentId);
        }

        if (status === MemberStatus.INACTIVE) {
          await this.reactivateInTx(tx, target.memberId);
        } else {
          // Renouvellement anticipé : le membre était à jour, seule l'échéance est repoussée.
          // Surtout PAS de nouvelle baseline ici — il n'a jamais cessé d'apparier ses points,
          // la figer lui ferait perdre son carry-over en cours pour rien.
          await tx.member.update({
            where: { id: target.memberId },
            data: { renewalAt: new Date() },
          });
        }

        await tx.auditLog.create({
          data: {
            actor: String(input.adminId),
            action: 'RENEWAL_VALIDATED',
            target: `MembershipPayment:${input.paymentId}`,
            before: { memberStatus: status },
            after: {
              memberId: target.memberId,
              memberStatus:
                status === MemberStatus.INACTIVE ? MemberStatus.ACTIVE : status,
              reactivated: status === MemberStatus.INACTIVE,
            },
          },
        });

        return this.toView(
          await tx.membershipPayment.findUniqueOrThrow({
            where: { id: input.paymentId },
            include: PAYMENT_INCLUDE,
          }),
        );
      },
      { timeout: TX_TIMEOUT_MS },
    );
  }

  /** File d'attente admin (l'écran arrive en Tranche 8), plus anciens d'abord. */
  async listPending(): Promise<MembershipPaymentView[]> {
    const payments = await this.prisma.membershipPayment.findMany({
      where: {
        type: MembershipPaymentType.RENEWAL,
        status: MembershipPaymentStatus.PENDING_VALIDATION,
      },
      include: PAYMENT_INCLUDE,
      orderBy: { id: 'asc' },
    });
    return payments.map((payment) => this.toView(payment));
  }

  /** Les renouvellements d'un membre (portail affilié), plus récents d'abord. */
  async listForMember(memberId: number): Promise<MembershipPaymentView[]> {
    const payments = await this.prisma.membershipPayment.findMany({
      where: { memberId, type: MembershipPaymentType.RENEWAL },
      include: PAYMENT_INCLUDE,
      orderBy: { id: 'desc' },
    });
    return payments.map((payment) => this.toView(payment));
  }

  // ─────────────────────────── Gel / réactivation (partie moteur) ───────────────────────────

  /** Gel : renouvellement annuel échu (constaté par l'admin — T8) ou décision de gestion. */
  async freeze(memberId: number): Promise<void> {
    await this.prisma.$transaction(
      (tx) => this.transitionInTx(tx, memberId, 'FREEZE'),
      { timeout: TX_TIMEOUT_MS },
    );
  }

  /**
   * Réactivation directe, sans paiement — voie de gestion et de tests. La voie normale d'un
   * membre réel passe par `pay()` puis `validate()` (D-038).
   */
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
      await this.reactivateInTx(tx, memberId);
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

  /**
   * INACTIF → ACTIF (D-034). Nouvelle baseline (documentaire — la pool n'a rien reçu pendant
   * le gel), calculée EN SQL sous verrou, comme à l'activation. Le carry-over (pools) n'est
   * PAS touché : ce qui avait été acquis avant le gel reste appariable.
   */
  private async reactivateInTx(
    tx: Prisma.TransactionClient,
    memberId: number,
  ): Promise<void> {
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

  private toView(payment: PaymentWithRelations): MembershipPaymentView {
    return {
      id: payment.id,
      memberId: payment.memberId,
      memberCode: payment.member.memberCode,
      type: payment.type,
      status: payment.status,
      amountDt: moneyToApi(payment.amountDt),
      paidAt: payment.paidAt,
      validatedAt: payment.validatedAt,
      ecardIds: payment.ecards.map((ecard) => ecard.id),
    };
  }
}
