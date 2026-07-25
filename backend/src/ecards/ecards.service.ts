import { Injectable, Logger } from '@nestjs/common';
import {
  Ecard,
  EcardOrigin,
  EcardStatus,
  LedgerMovementType,
  Prisma,
} from '@prisma/client';
import { Money, ZERO_DT, moneyToApi } from '../common/money';
import { LedgerService } from '../ledger/ledger.service';
import { ActivationPayment } from '../members/members.types';
import { PrismaService } from '../prisma/prisma.service';
import { generateEcardCode, normalizeEcardCode } from './ecard-code';
import {
  DuplicateEcardCodeError,
  EcardAlreadyConsumedError,
  EcardAlreadyUnlimitedError,
  EcardExpiredError,
  EcardNotActiveError,
  EcardNotFoundError,
  EcardNotOwnedError,
  EcardsTotalMismatchError,
  InvalidExpirationDaysError,
  InvalidExpirationSettingError,
  TooManyEcardsError,
} from './ecards.errors';
import {
  ConsumedEcards,
  CreatedEcardView,
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
/**
 * Plafond d'e-cards par paiement — RÉVISE D-030 (« nombre illimité »).
 *
 * Motif de sécurité, pas de métier : l'inscription est un endpoint PUBLIC et ANONYME (D-021)
 * qui consomme désormais de la valeur. Le quota de requêtes par IP compte des REQUÊTES, pas
 * des codes : sans plafond, une seule requête vaudrait autant d'essais qu'elle porte de
 * champs, et l'anti-brute-force ne protégerait plus rien. À 10, le débit maximal reste de
 * 50 essais/heure/IP contre 32^12 ≈ 1,15 × 10^18 codes possibles.
 */
export const MAX_ECARDS_PER_PAYMENT = 10;
const DAY_MS = 86_400_000;

/**
 * Cycle de vie complet de l'e-card (spec §5.5, D-007, D-008, D-025, D-028).
 *
 * UNITÉ : le DINAR. Une e-card est de l'ARGENT — c'est l'instrument par lequel l'argent entre
 * dans une transaction, alors qu'il circule hors plateforme (aucune passerelle, D-001). Elle ne
 * porte JAMAIS de points : les points n'entrent dans l'arbre que par une activation (D-005).
 *
 * MODÈLE (D-025) — l'e-card est un instrument de PAIEMENT, pas une recharge de solde :
 *   création    : le solde du créateur est débité (ECARD_CREATION) ; la valeur vit dans la carte ;
 *   consommation: la carte est BRÛLÉE et paie le montant dû — aucun solde n'est crédité ;
 *   expiration / révocation : la valeur revient au créateur (ECARD_REFUND).
 * La masse monétaire est donc conservée : ce qui sort d'un solde revient à ce solde, ou est
 * consommé en payant. Aucune ligne de grand livre à la consommation : le grand livre est
 * le journal des SOLDES, et aucun solde ne bouge.
 *
 * VERROUILLAGE (D-024) — ordre inter-tables `Member` → `Ecard` (ids croissants), sans
 * exception. Toute opération qui rembourse écrit donc le mouvement de solde (qui verrouille le
 * membre) AVANT de revendiquer l'e-card. Revendiquer l'e-card d'abord croiserait l'ordre de
 * l'activation (chaîne `Member` verrouillée, puis cartes brûlées) et rouvrirait
 * l'interblocage. Depuis le cumul (D-030), l'ordre par id croissant s'applique AUSSI entre
 * cartes : deux paiements concurrents se recoupant se sérialisent au lieu de s'attendre en
 * rond.
 */
@Injectable()
export class EcardsService {
  private readonly logger = new Logger(EcardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
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
    valueDt: Money;
  }): Promise<CreatedEcardView> {
    const expiresAt = await this.computeExpiresAt();

    // Une collision de code fait échouer l'INSERT, ce qui AVORTE la transaction Postgres :
    // impossible de simplement régénérer à l'intérieur. On rejoue donc la transaction entière.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const entry = await this.ledger.recordMovementInTx(tx, {
              memberId: input.creatorId,
              type: LedgerMovementType.ECARD_CREATION,
              amountDt: input.valueDt.negated(),
            });

            const ecard = await tx.ecard.create({
              data: {
                code: generateEcardCode(),
                valueDt: input.valueDt,
                status: EcardStatus.ACTIVE,
                origin: EcardOrigin.MEMBER,
                creatorId: input.creatorId,
                expiresAt,
              },
            });

            await tx.ledgerEntry.update({
              where: { id: entry.id },
              data: { ecardId: ecard.id },
            });

            // Le code est rendu ICI, et ICI SEULEMENT (D-048) : le créateur ne pourra plus
            // jamais le relire. C'est ce qui rend le masquage réel plutôt que cosmétique.
            return this.toCreatedView(ecard);
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
      select: { valueDt: true, status: true, expiresAt: true },
    });
    if (!ecard) {
      throw new EcardNotFoundError();
    }

    const expired = this.isExpired(ecard.expiresAt);
    const valid = ecard.status === EcardStatus.ACTIVE && !expired;

    return {
      valid,
      valueDt: moneyToApi(ecard.valueDt),
      status: ecard.status,
      expiresAt: ecard.expiresAt,
      reason: valid ? null : expired ? 'EXPIRED' : ecard.status,
    };
  }

  // ─────────────────────────── Consommation ───────────────────────────

  /**
   * Brûle UN LOT d'e-cards pour payer `dueDt` (en DINARS — une e-card est de l'argent, D-028),
   * DANS la transaction de l'appelant : les cartes ne passent `USED` que si cette transaction
   * committe. Un checkout interrompu les laisse toutes `ACTIVE` (spec §5.4) — c'est le
   * rollback Postgres qui le garantit, jamais une compensation applicative.
   *
   * CUMUL (D-030) : plusieurs cartes règlent un même paiement, et c'est leur SOMME qui doit
   * égaler le montant dû, exactement, au millime. Les gains arrivent par petits montants et
   * les activations se chiffrent en milliers de dinars : exiger une carte unique de valeur
   * pile rendrait le système inutilisable. Ni trop-perçu, ni appoint pour autant — un
   * excédent serait de la valeur perdue sans trace.
   *
   * ORDRE DE VERROUILLAGE (D-024) : les cartes sont brûlées par **id CROISSANT**. À plusieurs
   * cartes, deux transactions concurrentes tenant chacune une carte que l'autre convoite
   * s'interbloqueraient ; l'ordre total commun rend le graphe d'attente acyclique. Ce n'est
   * pas cosmétique, c'est la même règle que la chaîne d'ancêtres et que les produits.
   *
   * Les contrôles préalables ne servent qu'à produire une erreur PARLANTE. L'autorité est
   * l'`UPDATE` gardé (`WHERE status = 'ACTIVE' AND "valueDt" = … AND non échue`) : deux
   * consommations simultanées de la même carte se sérialisent sur le verrou de ligne, et la
   * perdante relit le `status` committé par la gagnante → 0 ligne → rollback complet.
   * Exactement une réussit, toujours. La garde épingle aussi la VALEUR : sans elle, une carte
   * modifiée entre le calcul du total et le brûlage ferait payer le mauvais montant.
   *
   * Les valeurs sont comparées en `numeric` (paramètres typés) : jamais un flottant.
   */
  async consumeManyInTx(
    tx: Prisma.TransactionClient,
    input: {
      codes: string[];
      memberId: number;
      dueDt: Money;
      /** Adhésion réglée par ces cartes (inscription / renouvellement). */
      membershipPaymentId?: number;
    },
  ): Promise<ConsumedEcards> {
    const codes = input.codes.map(normalizeEcardCode);
    if (codes.length === 0) {
      throw new EcardsTotalMismatchError(ZERO_DT, input.dueDt, 0);
    }
    if (codes.length > MAX_ECARDS_PER_PAYMENT) {
      throw new TooManyEcardsError(codes.length, MAX_ECARDS_PER_PAYMENT);
    }
    // Le même code deux fois compterait sa valeur deux fois dans le total alors qu'une seule
    // carte serait brûlée : le paiement serait à moitié gratuit.
    const unique = new Set(codes);
    if (unique.size !== codes.length) {
      throw new DuplicateEcardCodeError();
    }

    // Tri par id croissant assuré ici : c'est l'ordre de verrouillage (D-024).
    const ecards = await tx.ecard.findMany({
      where: { code: { in: [...unique] } },
      select: { id: true, valueDt: true, status: true, expiresAt: true },
      orderBy: { id: 'asc' },
    });
    if (ecards.length !== unique.size) {
      throw new EcardNotFoundError(); // au moins un code inconnu
    }
    for (const ecard of ecards) {
      if (ecard.status !== EcardStatus.ACTIVE) {
        throw new EcardNotActiveError(ecard.status);
      }
      if (this.isExpired(ecard.expiresAt)) {
        throw new EcardExpiredError();
      }
    }

    // Couverture EXACTE de la SOMME (spec §5.5, D-007 révisé par D-030).
    // `.equals` et non `!==` : deux `Decimal` de même valeur sont deux objets distincts.
    const totalDt = ecards.reduce(
      (sum, ecard) => sum.plus(ecard.valueDt),
      ZERO_DT,
    );
    if (!totalDt.equals(input.dueDt)) {
      throw new EcardsTotalMismatchError(totalDt, input.dueDt, ecards.length);
    }

    const ecardIds: number[] = [];
    for (const ecard of ecards) {
      const burned = await tx.$queryRaw<Array<{ id: number }>>`
        UPDATE "Ecard"
        SET "status" = 'USED'::"EcardStatus",
            "usedAt" = now(),
            "userId" = ${input.memberId},
            "membershipPaymentId" = ${input.membershipPaymentId ?? null}::int
        WHERE "id" = ${ecard.id}
          AND "status" = 'ACTIVE'::"EcardStatus"
          AND "valueDt" = ${ecard.valueDt}
          AND ("expiresAt" IS NULL OR "expiresAt" > now())
        RETURNING "id"
      `;
      if (burned.length !== 1) {
        throw new EcardAlreadyConsumedError();
      }
      ecardIds.push(ecard.id);
    }

    // AUCUN mouvement de grand livre (D-025) : la valeur des cartes paie le montant dû, elle
    // ne transite pas par le solde du bénéficiaire.
    return { ecardIds, totalDt };
  }

  /**
   * Rattache des cartes déjà brûlées à la commande qu'elles ont réglée. En deux temps parce
   * que la commande n'existe pas encore au moment du paiement : l'activation consomme avant
   * que le checkout n'insère l'`Order` (ordre de verrouillage D-024 : `Ecard` avant `Order`).
   * Même transaction — une carte brûlée sans son rattachement n'existe donc jamais.
   */
  async attachToOrderInTx(
    tx: Prisma.TransactionClient,
    ecardIds: number[],
    orderId: number,
  ): Promise<void> {
    if (ecardIds.length === 0) {
      return;
    }
    await tx.ecard.updateMany({
      where: { id: { in: ecardIds } },
      data: { orderId },
    });
  }

  /**
   * Stratégie de paiement de l'activation adossée à des e-cards (interface `ActivationPayment`
   * laissée par la Tranche 4). Le checkout s'en sert :
   *   `activation.activate({ memberId, packId, payment: ecards.activationPayment(codes) })`
   */
  activationPayment(codes: string[]): ActivationPayment {
    return new EcardActivationPayment(this, codes);
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
            before: {
              status: EcardStatus.ACTIVE,
              valueDt: moneyToApi(ecard.valueDt),
            },
            after: {
              status: EcardStatus.REVOKED,
              refundedTo: ecard.creatorId, // null si genèse : rien à rembourser
              refundedDt: moneyToApi(
                ecard.creatorId ? ecard.valueDt : ZERO_DT,
              ),
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
    valueDt: Money;
    expirationDays?: number;
    reason?: string;
  }): Promise<CreatedEcardView> {
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
                valueDt: input.valueDt,
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
                  valueDt: moneyToApi(ecard.valueDt),
                  expiresAt: ecard.expiresAt?.toISOString() ?? null,
                  reason: input.reason ?? null,
                },
              },
            });

            return this.toCreatedView(ecard);
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
      refundedDt: ZERO_DT,
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
                    valueDt: moneyToApi(closed.valueDt),
                  },
                  after: {
                    status: EcardStatus.EXPIRED,
                    refundedTo: closed.creatorId,
                    refundedDt: moneyToApi(
                      closed.creatorId ? closed.valueDt : ZERO_DT,
                    ),
                  },
                },
              });
            },
            { timeout: TX_TIMEOUT_MS },
          );
          result.expired += 1;
          if (ecard.creatorId) {
            result.refundedDt = result.refundedDt.plus(ecard.valueDt);
          }
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
        type: LedgerMovementType.ECARD_REFUND,
        amountDt: ecard.valueDt,
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
      valueDt: moneyToApi(ecard.valueDt),
      status: ecard.status,
      origin: ecard.origin,
      createdAt: ecard.createdAt,
      usedAt: ecard.usedAt,
      expiresAt: ecard.expiresAt,
      closedAt: ecard.closedAt,
    };
  }

  /** Vue de création : la vue ordinaire PLUS le code, rendu une seule fois (D-048). */
  private toCreatedView(ecard: Ecard): CreatedEcardView {
    return { ...this.toView(ecard), code: ecard.code };
  }
}
