import { Injectable } from '@nestjs/common';
import { MemberStatus, Prisma } from '@prisma/client';
import { money, moneyToApi } from '../common/money';
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
 * Activation INSCRIT → ACTIF (spec §5.3, §5.4, §9.1) : la SEULE opération qui injecte des
 * POINTS dans l'arbre. Tout se fait dans une transaction unique — statut, snapshot, règlement,
 * baseline et propagation committent ensemble ou pas du tout.
 *
 * LES DEUX DIMENSIONS SE CROISENT ICI, ET NULLE PART AILLEURS (D-028) — sans se convertir :
 *   on FAIT PAYER `snapshot.priceDt`  (DINARS — le prix du pack, D-029) à la stratégie de paiement ;
 *   on CRÉDITE   `snapshot.tierBv`    (POINTS — le palier) aux ancêtres dans l'arbre.
 * Le prix ne se déduit pas du palier, et le palier ne vaut pas le prix : ce sont deux grandeurs
 * indépendantes, toutes deux figées au snapshot.
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
    // Avant tout verrou : un paramètre corrompu doit faire échouer l'activation sans avoir
    // immobilisé une branche de l'arbre.
    const startupBonus = await this.startupBonusDefault(tx);

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
      tierBv: pack.tierBv, // POINTS — pour l'arbre
      priceDt: moneyToApi(pack.priceDt), // DINARS — pour le paiement (D-029)
      directCommissionDt: moneyToApi(pack.directCommissionDt),
      indirectCommissionDt: moneyToApi(pack.indirectCommissionDt),
      weeklyCapDt: moneyToApi(pack.weeklyCapDt),
    };

    // 4. RÈGLEMENT du PRIX DU PACK (en DINARS — D-029), délégué à la stratégie de paiement
    //    (D-025) — elle règle intégralement, ou elle lève (et toute l'activation est annulée) :
    //      - solde  : débit ACTIVATION du membre (grand livre) ;
    //      - e-card : la carte est brûlée, AUCUN solde n'est touché.
    //    Ce n'est PAS le palier qu'on fait payer : le palier est en points, et un point ne se
    //    paie pas. C'est le prix du pack, figé au snapshot comme le reste.
    //    L'ordre de verrouillage (D-024) est respecté : la chaîne `Member` est déjà
    //    verrouillée (étape 1), l'`Ecard` ne l'est qu'ici — Member → Ecard, jamais l'inverse.
    const settlement = await payment.settleInTx(tx, {
      memberId: member.id,
      amountDt: money(snapshot.priceDt),
    });

    // 5. Passage à ACTIF + baseline figée. `baselineLeft = leftPoints` est calculé EN SQL,
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

    // 6. Propagation du palier SNAPSHOTÉ — en POINTS — à tous les ancêtres, sur la bonne jambe
    //    (D-020). L'arbre ne voit jamais un dinar : ce qui monte, ce sont les points du palier.
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
      startupBonusRemaining: startupBonus,
      creditedAncestors: chain.ancestorCount,
      payment: settlement,
    };
  }

  /** Réserve de bonus de démarrage figée à l'activation (défaut 6, paramétrable — D-012). */
  private async startupBonusDefault(
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const setting = await tx.setting.findUnique({
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
