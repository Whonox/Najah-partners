import { Injectable } from '@nestjs/common';
import { MemberStatus, Prisma } from '@prisma/client';
import { CommissionEventsService } from '../commissions/commission-events.service';
import { money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivationAmountInvalidError,
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
/** Échouer proprement plutôt que d'attendre indéfiniment un verrou de branche. */
const LOCK_TIMEOUT = "SET LOCAL lock_timeout = '3s'";

export interface ActivateInput {
  memberId: number;
  packId: number;
  /** Moyen de paiement (Tranche 5 : e-card). Défaut : le solde BV déjà approvisionné. */
  payment?: ActivationPayment;
}

/**
 * Activation INSCRIT → ACTIF (spec §5.3, §5.4, §9.1) : la SEULE opération qui injecte des
 * POINTS dans l'arbre. Tout se fait dans une transaction unique — statut, snapshot, règlement,
 * baseline, propagation ET événements de commission (temps 1 du moteur, D-035) committent
 * ensemble ou pas du tout : une activation interrompue ne laisse aucun événement orphelin.
 *
 * LES DEUX DIMENSIONS SE CROISENT ICI, ET NULLE PART AILLEURS (D-028) — sans se convertir :
 *   on FAIT PAYER `snapshot.amountDueDt` (DINARS — prix du pack MOINS l'acompte d'inscription,
 *                                         D-029 + D-037) à la stratégie de paiement ;
 *   on CRÉDITE   `snapshot.tierBv`       (POINTS — le palier) aux ancêtres dans l'arbre.
 * Le prix ne se déduit pas du palier, et le palier ne vaut pas le prix : ce sont deux grandeurs
 * indépendantes, toutes deux figées au snapshot. L'acompte ne touche QUE l'argent : le panier
 * doit toujours totaliser le palier exact en points, et l'arbre reçoit le palier entier.
 *
 * Aucune route HTTP n'expose ce service (D-023) : la seule porte d'entrée en ACTIF est
 * l'achat par e-card finalisé — le checkout de la Tranche 6, qui compose sa propre
 * transaction (commande + stock) autour de `activateInTx`.
 */
@Injectable()
export class ActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly placement: PlacementService,
    private readonly commissionEvents: CommissionEventsService,
    private readonly defaultPayment: BalanceActivationPayment,
  ) {}

  /** Activation autonome (seed, tests) : ouvre la transaction et délègue à `activateInTx`. */
  async activate(input: ActivateInput): Promise<ActivationResult> {
    return this.prisma.$transaction((tx) => this.activateInTx(tx, input), {
      timeout: TX_TIMEOUT_MS,
    });
  }

  /**
   * Cœur de l'activation, DANS la transaction de l'appelant — c'est ainsi que le checkout
   * (T6) tient commande + e-card + activation + arbre + stock d'un seul bloc : Prisma
   * n'imbrique pas les transactions interactives, l'activation doit donc pouvoir composer.
   *
   * CONTRAT D'APPEL (D-024) : à invoquer AVANT tout autre verrou de la transaction. C'est ici
   * que la chaîne d'ancêtres est verrouillée (ids croissants), et l'ordre inter-tables du
   * projet — `Member` → `Ecard` → `Product` — en découle. Verrouiller une e-card ou un produit
   * en amont croiserait cet ordre et rouvrirait l'interblocage de la Tranche 4.
   */
  async activateInTx(
    tx: Prisma.TransactionClient,
    input: ActivateInput,
  ): Promise<ActivationResult> {
    const payment = input.payment ?? this.defaultPayment;

    await tx.$executeRawUnsafe(LOCK_TIMEOUT);

    // 1. VERROU ORDONNÉ (D-024) — première instruction touchant `Member` : le membre et
    //    tous ses ancêtres, par id croissant. Aucun autre verrou ne doit être pris avant.
    const chain = await this.placement.lockChainInTx(tx, input.memberId);

    // 2. Relecture du statut SOUS VERROU : garde d'idempotence (double soumission, retry).
    //    `sponsorId` sert au temps 1 du moteur : la commission DIRECTE va au sponsor.
    //    `registrationPaidDt` est l'ACOMPTE versé à l'inscription (D-037) — relu ici, sous le
    //    verrou déjà pris, sans requête ni verrou supplémentaire.
    const member = await tx.member.findUnique({
      where: { id: input.memberId },
      select: {
        id: true,
        memberCode: true,
        status: true,
        sponsorId: true,
        registrationPaidDt: true,
      },
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
    // L'ACOMPTE (D-037) : les frais d'inscription déjà versés viennent en déduction du prix du
    // pack. On lit la valeur FIGÉE sur le membre, jamais le paramètre `registration_fee_dt`
    // courant — le tarif a pu changer entre l'inscription et l'activation, et c'est ce que le
    // membre a réellement payé qui fait foi. Le total déboursé reste le prix du pack.
    const registrationCreditDt = member.registrationPaidDt;
    const amountDueDt = pack.priceDt.minus(registrationCreditDt);
    if (amountDueDt.lessThanOrEqualTo(0)) {
      throw new ActivationAmountInvalidError(
        moneyToApi(pack.priceDt),
        moneyToApi(registrationCreditDt),
      );
    }

    const snapshot: ActivationSnapshot = {
      packName: pack.name,
      tierBv: pack.tierBv, // POINTS — pour l'arbre, INCHANGÉ par l'acompte (D-037)
      priceDt: moneyToApi(pack.priceDt), // DINARS — le TARIF du pack (D-029)
      registrationCreditDt: moneyToApi(registrationCreditDt), // DINARS — déduits (D-037)
      amountDueDt: moneyToApi(amountDueDt), // DINARS — ce qui est réellement encaissé
      directCommissionDt: moneyToApi(pack.directCommissionDt),
      indirectCommissionDt: moneyToApi(pack.indirectCommissionDt),
      weeklyCapDt: moneyToApi(pack.weeklyCapDt),
    };

    // 4. RÈGLEMENT du MONTANT DÛ (en DINARS — prix du pack moins l'acompte, D-029 + D-037),
    //    délégué à la stratégie de paiement (D-025) — elle règle intégralement, ou elle lève
    //    (et toute l'activation est annulée) :
    //      - solde   : débit ACTIVATION du membre (grand livre) ;
    //      - e-cards : les cartes sont brûlées, AUCUN solde n'est touché.
    //    Ce n'est PAS le palier qu'on fait payer : le palier est en points, et un point ne se
    //    paie pas. C'est un montant en dinars, figé au snapshot comme le reste.
    //    L'ordre de verrouillage (D-024) est respecté : la chaîne `Member` est déjà
    //    verrouillée (étape 1), l'`Ecard` ne l'est qu'ici — Member → Ecard, jamais l'inverse.
    const settlement = await payment.settleInTx(tx, {
      memberId: member.id,
      amountDt: money(snapshot.amountDueDt),
    });

    // 5. Passage à ACTIF + baseline figée. `baselineLeft = leftPoints` est calculé EN SQL,
    //    sous verrou : les points accumulés pendant la phase INSCRIT sont ainsi exclus des
    //    commissions propres du membre (§5.8) — la pool appariable, elle, reste à zéro (la
    //    propagation ne crédite que les ACTIFS : la baseline vaut par construction, D-035).
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
          "updatedAt" = now()
      WHERE "id" = ${member.id}
        AND "status" = 'REGISTERED'::"MemberStatus"
      RETURNING "baselineLeft", "baselineRight"
    `;
    if (updated.length !== 1) {
      throw new MemberNotRegisteredError(member.id, member.status);
    }

    // 6. Propagation du palier SNAPSHOTÉ — en POINTS — à tous les ancêtres, sur la bonne jambe
    //    (D-020). L'arbre ne voit jamais un dinar : ce qui monte, ce sont les points du palier.
    //    Le RETURNING rapporte l'état des ancêtres SOUS VERROU : l'entrée du temps 1.
    const ancestors = await this.placement.propagateInTx(
      tx,
      member.id,
      snapshot.tierBv,
      chain.ancestorCount,
    );

    // 7. TEMPS 1 DU MOTEUR (D-035) : événements de commission écrits au fil de l'eau —
    //    DIRECT pour le sponsor (D-033 : avant les équilibres), équilibres/bonus/Points
    //    Fidélité pour les ancêtres, points appariés consommés immédiatement. Même
    //    transaction : tout-ou-rien.
    const sponsor = member.sponsorId
      ? await tx.member.findUnique({
          where: { id: member.sponsorId },
          select: { id: true, status: true },
        })
      : null;
    const events = await this.commissionEvents.recordActivationEventsInTx(tx, {
      sourceMemberId: member.id,
      sourceSnapshot: snapshot,
      sponsor,
      ancestors,
    });

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
          commissionEvents: { ...events },
          payment: { ...settlement },
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
      creditedAncestors: chain.ancestorCount,
      commissionEvents: events,
      payment: settlement,
    };
  }
}
