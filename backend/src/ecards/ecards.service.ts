import { Injectable, Logger } from '@nestjs/common';
import {
  BvMovementType,
  Ecard,
  EcardOrigin,
  EcardStatus,
  Prisma,
} from '@prisma/client';
import { BvLedgerService } from '../bv-ledger/bv-ledger.service';
import { ActivationPayment } from '../members/members.types';
import { PrismaService } from '../prisma/prisma.service';
import { generateEcardCode, normalizeEcardCode } from './ecard-code';
import {
  EcardAlreadyConsumedError,
  EcardAlreadyUnlimitedError,
  EcardExpiredError,
  EcardNotActiveError,
  EcardNotFoundError,
  EcardNotOwnedError,
  EcardValueMismatchError,
  InvalidExpirationDaysError,
  InvalidExpirationSettingError,
} from './ecards.errors';
import {
  ConsumedEcard,
  EcardVerification,
  EcardView,
  ExpirationSweepResult,
} from './ecards.types';
import { EcardActivationPayment } from './payment/ecard-activation-payment';

const TX_TIMEOUT_MS = 10_000;
const EXPIRATION_SETTING = 'ecard_expiration_days';
const UNLIMITED = -1;
/** Collisions de code : l'espace est immense, 5 essais couvrent l'improbable sans boucler. */
const MAX_CODE_ATTEMPTS = 5;
/** Le cron traite les échéances par lots : un pic d'expirations ne doit pas tenir une transaction géante. */
const EXPIRATION_BATCH = 200;
const DAY_MS = 86_400_000;

/**
 * Cycle de vie complet de l'e-card (spec §5.5, D-007, D-008, D-025).
 *
 * MODÈLE (D-025) — l'e-card est un instrument de PAIEMENT, pas une recharge de solde :
 *   création    : le solde du créateur est débité (ECARD_CREATION) ; la valeur vit dans la carte ;
 *   consommation: la carte est BRÛLÉE et paie le montant dû — aucun solde n'est crédité ;
 *   expiration / révocation : la valeur revient au créateur (ECARD_REFUND).
 * La masse BV est donc conservée : ce qui sort d'un solde revient à ce solde, ou est
 * consommé en payant. Aucune ligne de grand livre à la consommation : le grand livre est
 * le journal des SOLDES, et aucun solde ne bouge.
 *
 * VERROUILLAGE (D-024) — ordre inter-tables `Member` → `Ecard`, sans exception. Toute
 * opération qui rembourse écrit donc le mouvement BV (qui verrouille le membre) AVANT de
 * revendiquer l'e-card. Revendiquer l'e-card d'abord croiserait l'ordre de l'activation
 * (chaîne `Member` verrouillée, puis carte brûlée) et rouvrirait l'interblocage.
 */
@Injectable()
export class EcardsService {
  private readonly logger = new Logger(EcardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: BvLedgerService,
  ) {}

  // ─────────────────────────── Création (membre) ───────────────────────────

  /**
   * Crée une e-card depuis le solde du créateur. Débit immédiat via le grand livre — seul
   * point d'écriture des soldes (D-017) : un montant supérieur au solde lève
   * `InsufficientBalanceError` SOUS le verrou de ligne, et rien n'est créé.
   *
   * Le débit précède l'INSERT : ordre `Member` → `Ecard` (D-024). La ligne de mouvement est
   * ensuite rattachée à l'e-card (`ecardId`) — impossible à faire en une passe, l'identifiant
   * de la carte n'existant pas encore.
   */
  async create(input: {
    creatorId: number;
    valueBv: number;
  }): Promise<EcardView> {
    const expiresAt = await this.computeExpiresAt();

    // Une collision de code fait échouer l'INSERT, ce qui AVORTE la transaction Postgres :
    // impossible de simplement régénérer à l'intérieur. On rejoue donc la transaction entière.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const entry = await this.ledger.recordMovementInTx(tx, {
              memberId: input.creatorId,
              type: BvMovementType.ECARD_CREATION,
              amountBv: -input.valueBv,
            });

            const ecard = await tx.ecard.create({
              data: {
                code: generateEcardCode(),
                valueBv: input.valueBv,
                status: EcardStatus.ACTIVE,
                origin: EcardOrigin.MEMBER,
                creatorId: input.creatorId,
                expiresAt,
              },
            });

            await tx.bvLedgerEntry.update({
              where: { id: entry.id },
              data: { ecardId: ecard.id },
            });

            return this.toView(ecard);
          },
          { timeout: TX_TIMEOUT_MS },
        );
      } catch (error) {
        if (this.isCodeCollision(error) && attempt < MAX_CODE_ATTEMPTS) {
          this.logger.warn(
            `Collision de code e-card (essai ${attempt}/${MAX_CODE_ATTEMPTS}) — régénération.`,
          );
          continue;
        }
        throw error;
      }
    }
  }

  /** Mes e-cards : celles que J'AI créées (spec §7.1.3), plus récentes d'abord. */
  async listCreatedBy(creatorId: number): Promise<EcardView[]> {
    const ecards = await this.prisma.ecard.findMany({
      where: { creatorId },
      orderBy: { id: 'desc' },
    });
    return ecards.map((ecard) => this.toView(ecard));
  }

  // ─────────────────────────── Vérification (sans consommer) ───────────────────────────

  /**
   * Contrôle validité + valeur d'un code, SANS le consommer (spec §7.1.3). Lecture pure,
   * aucun verrou : le résultat est indicatif — seule la consommation fait autorité, et elle
   * revérifie tout sous verrou.
   *
   * Une carte échue mais pas encore balayée par le cron est signalée invalide : l'échéance
   * fait foi, pas le passage du cron.
   */
  async verify(rawCode: string): Promise<EcardVerification> {
    const ecard = await this.prisma.ecard.findUnique({
      where: { code: normalizeEcardCode(rawCode) },
      select: { valueBv: true, status: true, expiresAt: true },
    });
    if (!ecard) {
      throw new EcardNotFoundError();
    }

    const expired = this.isExpired(ecard.expiresAt);
    const valid = ecard.status === EcardStatus.ACTIVE && !expired;

    return {
      valid,
      valueBv: ecard.valueBv,
      status: ecard.status,
      expiresAt: ecard.expiresAt,
      reason: valid ? null : expired ? 'EXPIRED' : ecard.status,
    };
  }

  // ─────────────────────────── Consommation ───────────────────────────

  /**
   * Brûle une e-card pour payer `dueBv`, DANS la transaction de l'appelant : la carte ne
   * passe `USED` que si cette transaction committe. Une activation interrompue laisse donc
   * la carte `ACTIVE` (spec §5.4) — c'est le rollback Postgres qui le garantit, pas une
   * compensation applicative.
   *
   * Les contrôles préalables ne servent qu'à produire une erreur PARLANTE. L'autorité est
   * l'`UPDATE` gardé (`WHERE status = 'ACTIVE' AND …`) : deux consommations simultanées de
   * la même carte se sérialisent sur le verrou de ligne, et la perdante relit `status`
   * committé par la gagnante → 0 ligne → `EcardAlreadyConsumedError`, transaction annulée.
   * Exactement une réussit, toujours.
   */
  async consumeInTx(
    tx: Prisma.TransactionClient,
    input: { code: string; memberId: number; dueBv: number },
  ): Promise<ConsumedEcard> {
    const code = normalizeEcardCode(input.code);

    const ecard = await tx.ecard.findUnique({
      where: { code },
      select: { id: true, valueBv: true, status: true, expiresAt: true },
    });
    if (!ecard) {
      throw new EcardNotFoundError();
    }
    if (ecard.status !== EcardStatus.ACTIVE) {
      throw new EcardNotActiveError(ecard.status);
    }
    if (this.isExpired(ecard.expiresAt)) {
      throw new EcardExpiredError();
    }
    // Couverture EXACTE (spec §5.5) : ni trop-perçu, ni appoint, une seule carte.
    if (ecard.valueBv !== input.dueBv) {
      throw new EcardValueMismatchError(ecard.valueBv, input.dueBv);
    }

    const burned = await tx.$queryRaw<Array<{ id: number; valueBv: number }>>`
      UPDATE "Ecard"
      SET "status" = 'USED'::"EcardStatus",
          "usedAt" = now(),
          "userId" = ${input.memberId}
      WHERE "id" = ${ecard.id}
        AND "status" = 'ACTIVE'::"EcardStatus"
        AND "valueBv" = ${input.dueBv}
        AND ("expiresAt" IS NULL OR "expiresAt" > now())
      RETURNING "id", "valueBv"
    `;
    if (burned.length !== 1) {
      throw new EcardAlreadyConsumedError();
    }

    // AUCUN mouvement de grand livre (D-025) : la valeur de la carte paie le montant dû,
    // elle ne transite pas par le solde du bénéficiaire.
    return { ecardId: burned[0].id, valueBv: burned[0].valueBv };
  }

  /**
   * Stratégie de paiement de l'activation adossée à une e-card (interface `ActivationPayment`
   * laissée par la Tranche 4). Le checkout de la Tranche 6 s'en sert :
   *   `activation.activate({ memberId, packId, payment: ecards.activationPayment(code) })`
   */
  activationPayment(code: string): ActivationPayment {
    return new EcardActivationPayment(this, code);
  }

  // ─────────────────────────── Prolongation (créateur ou admin — D-026) ───────────────────────────

  /**
   * Repousse l'échéance de `days` jours. Prolonger ne crée AUCUNE valeur : le BV a quitté le
   * solde du créateur à l'émission ; retarder l'échéance ne fait que retarder son propre
   * remboursement. C'est pourquoi le créateur y a droit sans l'admin (D-026) — il est le seul
   * à savoir que son acheteur, hors plateforme, n'a pas encore utilisé la carte.
   *
   * `actorMemberId` non nul = un membre : il doit être le créateur. Nul = un admin (rôle déjà
   * contrôlé par le guard), qui peut prolonger n'importe quelle e-card, y compris une genèse.
   *
   * Seule une `ACTIVE` se prolonge : `USED` est définitive, et ressusciter une `EXPIRED` ou
   * `REVOKED` déjà remboursée créerait du BV ex nihilo (la carte ET le solde du créateur).
   */
  async extend(input: {
    ecardId: number;
    days: number;
    actorMemberId: number | null;
    actorAdminId: number | null;
  }): Promise<EcardView> {
    return this.prisma.$transaction(
      async (tx) => {
        const ecard = await tx.ecard.findUnique({
          where: { id: input.ecardId },
        });
        if (!ecard) {
          throw new EcardNotFoundError();
        }
        if (
          input.actorMemberId !== null &&
          ecard.creatorId !== input.actorMemberId
        ) {
          throw new EcardNotOwnedError();
        }
        if (ecard.status !== EcardStatus.ACTIVE) {
          throw new EcardNotActiveError(ecard.status);
        }
        if (ecard.expiresAt === null) {
          throw new EcardAlreadyUnlimitedError();
        }

        // On repousse depuis MAINTENANT si l'échéance est déjà passée (la carte est encore
        // ACTIVE, le cron ne l'a pas balayée) : sinon « +7 jours » sur une échéance vieille
        // d'un mois laisserait la carte expirée, prolongation inopérante et silencieuse.
        const base =
          ecard.expiresAt.getTime() > Date.now()
            ? ecard.expiresAt.getTime()
            : Date.now();
        const expiresAt = new Date(base + input.days * DAY_MS);

        // UPDATE gardé : si la carte est consommée entre la lecture et ici, 0 ligne → rollback.
        const rows = await tx.$queryRaw<Array<{ id: number }>>`
          UPDATE "Ecard"
          SET "expiresAt" = ${expiresAt}
          WHERE "id" = ${ecard.id} AND "status" = 'ACTIVE'::"EcardStatus"
          RETURNING "id"
        `;
        if (rows.length !== 1) {
          throw new EcardAlreadyConsumedError();
        }

        await tx.auditLog.create({
          data: {
            actor: input.actorAdminId
              ? String(input.actorAdminId)
              : `Member:${input.actorMemberId}`,
            action: 'ECARD_EXTENDED',
            target: `Ecard:${ecard.id}`, // jamais le code en clair
            before: { expiresAt: ecard.expiresAt.toISOString() },
            after: { expiresAt: expiresAt.toISOString(), days: input.days },
          },
        });

        return this.toView({ ...ecard, expiresAt });
      },
      { timeout: TX_TIMEOUT_MS },
    );
  }

  // ─────────────────────────── Révocation (admin) ───────────────────────────

  /** Révoque une e-card ACTIVE et recrédite son créateur (spec §5.5, D-008), atomiquement. */
  async revoke(input: {
    ecardId: number;
    adminId: number;
    reason?: string;
  }): Promise<EcardView> {
    return this.prisma.$transaction(
      async (tx) => {
        const ecard = await tx.ecard.findUnique({
          where: { id: input.ecardId },
        });
        if (!ecard) {
          throw new EcardNotFoundError();
        }
        if (ecard.status !== EcardStatus.ACTIVE) {
          throw new EcardNotActiveError(ecard.status);
        }

        const closed = await this.closeAndRefundInTx(
          tx,
          ecard,
          EcardStatus.REVOKED,
        );

        await tx.auditLog.create({
          data: {
            actor: String(input.adminId),
            action: 'ECARD_REVOKED',
            target: `Ecard:${ecard.id}`,
            before: { status: EcardStatus.ACTIVE, valueBv: ecard.valueBv },
            after: {
              status: EcardStatus.REVOKED,
              refundedTo: ecard.creatorId, // null si genèse : rien à rembourser
              refundedBv: ecard.creatorId ? ecard.valueBv : 0,
              reason: input.reason ?? null,
            },
          },
        });

        return this.toView(closed);
      },
      { timeout: TX_TIMEOUT_MS },
    );
  }

  // ─────────────────────────── Genèse (admin SUPER_ADMIN) ───────────────────────────

  /**
   * Génère une e-card ex nihilo pour amorcer le réseau ou une promo (spec §5.5). Aucun
   * créateur, donc aucun débit : la valeur naît avec la carte. En contrepartie, son
   * expiration ou sa révocation ne rembourse PERSONNE — la valeur disparaît comme elle est
   * apparue (invariant tenu par le CHECK `Ecard_origin_creator_ck`).
   *
   * Création de valeur ex nihilo = SUPER_ADMIN uniquement (D-017b), imposé par le contrôleur.
   */
  async genesis(input: {
    adminId: number;
    valueBv: number;
    expirationDays?: number;
    reason?: string;
  }): Promise<EcardView> {
    // Durée saisie par l'admin : erreur d'UTILISATEUR (400), à distinguer d'un paramètre
    // système corrompu (500) — d'où deux exceptions distinctes.
    const days = input.expirationDays;
    if (
      days !== undefined &&
      (!Number.isInteger(days) || (days !== UNLIMITED && days <= 0))
    ) {
      throw new InvalidExpirationDaysError(days);
    }
    const expiresAt =
      days === undefined
        ? await this.computeExpiresAt()
        : this.expiresAtFromDays(days, String(days));

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const ecard = await tx.ecard.create({
              data: {
                code: generateEcardCode(),
                valueBv: input.valueBv,
                status: EcardStatus.ACTIVE,
                origin: EcardOrigin.GENESIS,
                creatorId: null,
                createdByAdminId: input.adminId,
                expiresAt,
              },
            });

            await tx.auditLog.create({
              data: {
                actor: String(input.adminId),
                action: 'ECARD_GENESIS',
                target: `Ecard:${ecard.id}`, // jamais le code en clair
                after: {
                  valueBv: ecard.valueBv,
                  expiresAt: ecard.expiresAt?.toISOString() ?? null,
                  reason: input.reason ?? null,
                },
              },
            });

            return this.toView(ecard);
          },
          { timeout: TX_TIMEOUT_MS },
        );
      } catch (error) {
        if (this.isCodeCollision(error) && attempt < MAX_CODE_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
  }

  // ─────────────────────────── Expiration (cron quotidien) ───────────────────────────

  /**
   * Balaye les e-cards échues : `EXPIRED` + remboursement du créateur (D-008).
   *
   * UNE transaction par e-card, et non une transaction géante : un lot de 500 expirations
   * verrouillerait 500 membres d'un coup, en travers de toutes les activations en cours.
   * Une e-card consommée entre le balayage et sa transaction est simplement sautée
   * (`skipped`) — sa transaction est annulée, remboursement compris.
   */
  async expireDue(now: Date = new Date()): Promise<ExpirationSweepResult> {
    const result: ExpirationSweepResult = {
      expired: 0,
      refundedBv: 0,
      skipped: 0,
    };

    for (;;) {
      const due = await this.prisma.ecard.findMany({
        where: {
          status: EcardStatus.ACTIVE,
          expiresAt: { not: null, lte: now },
        },
        orderBy: { id: 'asc' },
        take: EXPIRATION_BATCH,
      });
      if (due.length === 0) {
        break;
      }

      for (const ecard of due) {
        try {
          await this.prisma.$transaction(
            async (tx) => {
              const closed = await this.closeAndRefundInTx(
                tx,
                ecard,
                EcardStatus.EXPIRED,
              );
              await tx.auditLog.create({
                data: {
                  actor: 'SYSTEM',
                  action: 'ECARD_EXPIRED',
                  target: `Ecard:${closed.id}`,
                  before: {
                    status: EcardStatus.ACTIVE,
                    valueBv: closed.valueBv,
                  },
                  after: {
                    status: EcardStatus.EXPIRED,
                    refundedTo: closed.creatorId,
                    refundedBv: closed.creatorId ? closed.valueBv : 0,
                  },
                },
              });
            },
            { timeout: TX_TIMEOUT_MS },
          );
          result.expired += 1;
          result.refundedBv += ecard.creatorId ? ecard.valueBv : 0;
        } catch (error) {
          if (error instanceof EcardAlreadyConsumedError) {
            result.skipped += 1; // consommée pendant le balayage : la course est normale
            continue;
          }
          throw error;
        }
      }

      // Le lot était plein : d'autres échéances attendent peut-être.
      if (due.length < EXPIRATION_BATCH) {
        break;
      }
    }

    return result;
  }

  // ─────────────────────────── Interne ───────────────────────────

  /**
   * Ferme une e-card ACTIVE (EXPIRED ou REVOKED) et recrédite son créateur, dans la
   * transaction de l'appelant.
   *
   * ORDRE (D-024) : on REMBOURSE d'abord — `recordMovementInTx` verrouille la ligne du
   * créateur — puis on revendique l'e-card. `Member` avant `Ecard`, comme l'activation
   * (chaîne d'ancêtres verrouillée, puis carte brûlée) : les deux chemins prennent leurs
   * verrous dans le même ordre, aucun cycle d'attente n'est possible. L'inverse (carte
   * d'abord, membre ensuite) rouvrirait l'interblocage de la Tranche 4.
   *
   * Si la carte a été consommée entre-temps, l'`UPDATE` gardé ne rend aucune ligne → on lève,
   * et le rollback annule le remboursement qu'on venait d'écrire : jamais de crédit orphelin.
   */
  private async closeAndRefundInTx(
    tx: Prisma.TransactionClient,
    ecard: Ecard,
    status: Extract<EcardStatus, 'EXPIRED' | 'REVOKED'>,
  ): Promise<Ecard> {
    if (ecard.creatorId !== null) {
      await this.ledger.recordMovementInTx(tx, {
        memberId: ecard.creatorId,
        type: BvMovementType.ECARD_REFUND,
        amountBv: ecard.valueBv,
        ecardId: ecard.id,
      });
    }
    // Genèse : creatorId nul → personne à rembourser, la valeur disparaît (D-025).

    const rows = await tx.$queryRaw<Array<{ id: number }>>`
      UPDATE "Ecard"
      SET "status" = ${status}::"EcardStatus",
          "closedAt" = now()
      WHERE "id" = ${ecard.id} AND "status" = 'ACTIVE'::"EcardStatus"
      RETURNING "id"
    `;
    if (rows.length !== 1) {
      throw new EcardAlreadyConsumedError();
    }

    return { ...ecard, status, closedAt: new Date() };
  }

  /** Échéance calculée depuis le paramètre système (`-1` = illimité → null). */
  private async computeExpiresAt(): Promise<Date | null> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: EXPIRATION_SETTING },
    });
    const raw = setting?.value ?? String(UNLIMITED);
    return this.expiresAtFromDays(Number(raw), raw);
  }

  private expiresAtFromDays(days: number, raw: string): Date | null {
    // Un paramètre corrompu écrirait une échéance absurde (voire `Invalid Date`) sur des
    // instruments de valeur : mieux vaut refuser l'émission.
    if (!Number.isInteger(days) || (days !== UNLIMITED && days <= 0)) {
      throw new InvalidExpirationSettingError(raw);
    }
    if (days === UNLIMITED) {
      return null;
    }
    return new Date(Date.now() + days * DAY_MS);
  }

  private isExpired(expiresAt: Date | null): boolean {
    return expiresAt !== null && expiresAt.getTime() <= Date.now();
  }

  /** Violation de l'index unique sur `Ecard.code` — le seul cas où régénérer a un sens. */
  private isCodeCollision(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (error.meta?.target as string[] | undefined)?.includes('code') === true
    );
  }

  private toView(ecard: Ecard): EcardView {
    return {
      id: ecard.id,
      code: ecard.code,
      valueBv: ecard.valueBv,
      status: ecard.status,
      origin: ecard.origin,
      createdAt: ecard.createdAt,
      usedAt: ecard.usedAt,
      expiresAt: ecard.expiresAt,
      closedAt: ecard.closedAt,
    };
  }
}
