import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Leg,
  MemberStatus,
  MembershipPaymentStatus,
  MembershipPaymentType,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { Money, moneyToApi } from '../common/money';
import {
  DuplicateEcardCodeError,
  EcardAlreadyConsumedError,
  EcardExpiredError,
  EcardNotActiveError,
  EcardNotFoundError,
  EcardsTotalMismatchError,
  TooManyEcardsError,
} from '../ecards/ecards.errors';
import { EcardsService } from '../ecards/ecards.service';
import { PrismaService } from '../prisma/prisma.service';
import { MemberCodeService } from './member-code.service';
import {
  MembershipFeeService,
  REGISTRATION_FEE_SETTING,
} from './membership-fee.service';
import {
  ContactAlreadyUsedError,
  MissingContactError,
  PlacementCheckRefusedError,
  PositionTakenError,
  RegistrationPaymentRefusedError,
  SponsorNotFoundError,
  UplineNotFoundError,
  UplineOutsideSponsorTreeError,
} from './members.errors';
import { RegisterMemberInput, RegisteredMember } from './members.types';
import { PlacementService } from './placement.service';

const TX_TIMEOUT_MS = 10_000;

/**
 * Toutes les façons dont un paiement d'inscription peut être refusé — réduites à UNE seule
 * réponse (voir `RegistrationPaymentRefusedError`). L'endpoint étant public et anonyme,
 * distinguer « code inconnu » de « déjà utilisée » offrirait un oracle d'énumération.
 */
const PAYMENT_REFUSAL_ERRORS = [
  EcardNotFoundError,
  EcardNotActiveError,
  EcardExpiredError,
  EcardsTotalMismatchError,
  EcardAlreadyConsumedError,
  DuplicateEcardCodeError,
  TooManyEcardsError,
] as const;

/**
 * Inscription (spec §5.3, D-013, D-021, D-022, D-036).
 *
 * Résultat d'une inscription : un membre INSCRIT, avec son code, sa place définitive dans
 * l'arbre — et les frais d'inscription réglés. Aucun POINT n'est injecté (seule l'activation
 * alimente l'arbre, D-005) et AUCUNE ligne de grand livre n'est écrite : les e-cards sont un
 * instrument de paiement, pas une recharge de solde (D-025). Rien ne transite par un solde.
 *
 * ATOMICITÉ (D-036) : membre + paiement + consommation des e-cards committent ensemble ou pas
 * du tout. Une position déjà prise, un sponsor inconnu, un upline hors sous-arbre — n'importe
 * quel échec laisse les cartes `ACTIVE` et ne crée aucun membre. Jamais d'e-card brûlée sans
 * membre, jamais de membre sans e-cards brûlées. C'est le rollback Postgres qui le garantit,
 * pas une compensation applicative.
 *
 * VERROUILLAGE (D-024) : `Member` (l'INSERT, qui prend un `FOR KEY SHARE` sur le sponsor et
 * l'upline via les clés étrangères) AVANT `Ecard` (ids croissants). Consommer d'abord
 * croiserait l'ordre du checkout et de l'expiration.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly placement: PlacementService,
    private readonly memberCode: MemberCodeService,
    private readonly fees: MembershipFeeService,
    private readonly ecards: EcardsService,
  ) {}

  /**
   * Vérification PRÉALABLE du triplet parrain / upline / jambe (D-052, précisée par D-061).
   *
   * ═══ LES QUATRE MÊMES CONTRÔLES QUE L'INSCRIPTION, DANS LE MÊME ORDRE ═══
   * Sponsor connu, upline connu, upline dans le réseau du sponsor (D-022), position libre
   * (D-004 : aucun spillover). Ce sont EXACTEMENT ceux que `register` refait ensuite — et
   * c'est voulu : une pré-vérification plus laxiste laisserait passer ce que l'inscription
   * refusera, une plus stricte refuserait ce qu'elle accepterait. Les deux trahiraient
   * l'affilié au pire moment.
   *
   * ═══ ELLE NE RÉSERVE RIEN ═══
   * Entre cette vérification et l'inscription, la position peut être prise par quelqu'un
   * d'autre. Le juge reste la transaction d'inscription, sous contrainte de base
   * (`@@unique([uplineId, leg])`). Cette route AIDE, elle ne garantit pas.
   *
   * ═══ ELLE NE DIT PAS CE QUI A ÉCHOUÉ ═══
   * Un seul refus pour les quatre causes (`PlacementCheckRefusedError`). Le retour est un
   * booléen : le type de réponse lui-même empêche d'en dire plus.
   */
  async checkPlacement(input: {
    sponsorCode: string;
    uplineCode: string;
    leg: Leg;
  }): Promise<{ ok: true }> {
    const sponsor = await this.prisma.member.findUnique({
      where: { memberCode: input.sponsorCode.trim() },
      select: { id: true },
    });
    if (!sponsor) throw new PlacementCheckRefusedError();

    const upline = await this.prisma.member.findUnique({
      where: { memberCode: input.uplineCode.trim() },
      select: { id: true },
    });
    if (!upline) throw new PlacementCheckRefusedError();

    const insideNetwork = await this.placement.isSponsorOnPathOf(
      sponsor.id,
      upline.id,
    );
    if (!insideNetwork) throw new PlacementCheckRefusedError();

    const occupant = await this.prisma.member.findUnique({
      where: { uplineId_leg: { uplineId: upline.id, leg: input.leg } },
      select: { id: true },
    });
    if (occupant) throw new PlacementCheckRefusedError();

    return { ok: true };
  }

  async register(input: RegisterMemberInput): Promise<RegisteredMember> {
    const email = input.email?.trim().toLowerCase() || null;
    const phone = input.phone?.trim() || null;

    // La connexion se fait par e-mail, téléphone ou code membre (D-011) : un compte sans
    // aucun contact serait joignable, mais son détenteur ne pourrait jamais être recontacté.
    if (!email && !phone) {
      throw new MissingContactError();
    }

    // ── Validations métier AVANT toute écriture (message clair plutôt qu'une violation
    // de contrainte brute). La contrainte DB reste l'arbitre final sous concurrence.
    const sponsor = await this.prisma.member.findUnique({
      where: { memberCode: input.sponsorCode.trim() },
      select: { id: true, memberCode: true },
    });
    if (!sponsor) {
      throw new SponsorNotFoundError(input.sponsorCode);
    }

    const upline = await this.prisma.member.findUnique({
      where: { memberCode: input.uplineCode.trim() },
      select: { id: true, memberCode: true },
    });
    if (!upline) {
      throw new UplineNotFoundError(input.uplineCode);
    }

    // D-022 : on ne place un filleul que sous son sponsor ou dans le réseau de celui-ci.
    const insideNetwork = await this.placement.isSponsorOnPathOf(
      sponsor.id,
      upline.id,
    );
    if (!insideNetwork) {
      throw new UplineOutsideSponsorTreeError(
        upline.memberCode,
        sponsor.memberCode,
      );
    }

    // Pas de spillover (D-004) : une position occupée n'est pas contournée, elle est refusée.
    const occupant = await this.prisma.member.findUnique({
      where: { uplineId_leg: { uplineId: upline.id, leg: input.leg } },
      select: { id: true },
    });
    if (occupant) {
      throw new PositionTakenError(upline.memberCode, input.leg);
    }

    await this.assertContactsFree(email, phone);

    // Le tarif est lu AVANT la transaction : un paramètre corrompu doit produire une 500
    // parlante, pas un rollback silencieux au milieu du paiement.
    const feeDt = await this.fees.read(REGISTRATION_FEE_SETTING);

    const passwordHash = await bcrypt.hash(input.password, this.bcryptRounds());

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Le code est alloué en dernier : la fenêtre pendant laquelle un rollback
          // laisserait un trou dans la numérotation est réduite au minimum.
          const memberCode = await this.memberCode.allocate(tx);
          const member = await tx.member.create({
            data: {
              memberCode,
              lastName: input.lastName.trim(),
              firstName: input.firstName.trim(),
              email,
              phone,
              passwordHash,
              status: MemberStatus.REGISTERED,
              sponsorId: sponsor.id,
              uplineId: upline.id,
              leg: input.leg,
              idDocumentType: input.idDocument?.type ?? null,
              idDocumentNumber: input.idDocument?.number ?? null,
              idDocumentPath: input.idDocument?.relativePath ?? null,
              // L'ACOMPTE (D-037), figé ici : c'est lui que l'activation déduira du prix du
              // pack, et non le paramètre courant — qui aura peut-être changé d'ici là.
              registrationPaidDt: feeDt,
            },
            select: {
              id: true,
              memberCode: true,
              lastName: true,
              firstName: true,
              status: true,
              leg: true,
              verificationStatus: true,
              registeredAt: true,
            },
          });

          // Le paiement précède la consommation : les cartes s'y rattachent en étant brûlées,
          // et une carte `USED` sans contrepartie lisible n'existe donc jamais.
          const payment = await tx.membershipPayment.create({
            data: {
              memberId: member.id,
              type: MembershipPaymentType.REGISTRATION,
              // Acquise d'emblée : l'inscription initiale ne demande aucune validation
              // administrateur (D-010) — seul le renouvellement en exige une.
              status: MembershipPaymentStatus.SETTLED,
              amountDt: feeDt,
            },
            select: { id: true },
          });

          const consumed = await this.settleRegistrationInTx(tx, {
            codes: input.ecardCodes,
            memberId: member.id,
            dueDt: feeDt,
            membershipPaymentId: payment.id,
          });

          await tx.auditLog.create({
            data: {
              actor: 'SYSTEM',
              action: 'MEMBER_REGISTERED',
              target: `Member:${member.id}`,
              after: {
                memberCode: member.memberCode,
                sponsorCode: sponsor.memberCode,
                uplineCode: upline.memberCode,
                leg: input.leg,
                registrationPaidDt: moneyToApi(feeDt),
                membershipPaymentId: payment.id,
                // Des IDENTIFIANTS, jamais les codes : un code est de la valeur au porteur,
                // et l'AuditLog se lit, s'exporte et se journalise (règle e-card).
                ecardIds: consumed.ecardIds,
              },
            },
          });

          return {
            ...member,
            leg: input.leg,
            sponsorCode: sponsor.memberCode,
            uplineCode: upline.memberCode,
            registrationPaidDt: moneyToApi(feeDt),
          };
        },
        { timeout: TX_TIMEOUT_MS },
      );
    } catch (error) {
      throw this.translateUniqueViolation(error, upline.memberCode, input.leg);
    }
  }

  /**
   * Consomme les e-cards des frais d'inscription et MASQUE la cause exacte d'un refus.
   *
   * Seules les erreurs métier des e-cards sont masquées ; tout le reste (base indisponible,
   * bug) remonte tel quel — un incident technique ne doit pas se déguiser en « e-card
   * invalide », on perdrait toute chance de le diagnostiquer.
   */
  private async settleRegistrationInTx(
    tx: Prisma.TransactionClient,
    input: {
      codes: string[];
      memberId: number;
      dueDt: Money;
      membershipPaymentId: number;
    },
  ): Promise<{ ecardIds: number[] }> {
    try {
      return await this.ecards.consumeManyInTx(tx, input);
    } catch (error) {
      const isRefusal = PAYMENT_REFUSAL_ERRORS.some(
        (type) => error instanceof type,
      );
      if (isRefusal) {
        throw new RegistrationPaymentRefusedError();
      }
      throw error;
    }
  }

  private async assertContactsFree(
    email: string | null,
    phone: string | null,
  ): Promise<void> {
    if (email) {
      const taken = await this.prisma.member.findUnique({
        where: { email },
        select: { id: true },
      });
      if (taken) {
        throw new ContactAlreadyUsedError('email');
      }
    }
    if (phone) {
      const taken = await this.prisma.member.findUnique({
        where: { phone },
        select: { id: true },
      });
      if (taken) {
        throw new ContactAlreadyUsedError('phone');
      }
    }
  }

  /**
   * Deux inscriptions concurrentes sur la même position passent toutes deux le pré-contrôle
   * applicatif : c'est la contrainte `@@unique([uplineId, leg])` qui tranche, et le perdant
   * remonte ici. `Member` porte quatre contraintes uniques — on ne mappe donc JAMAIS P2002
   * en aveugle sur « position occupée » : on lit la cible.
   */
  private translateUniqueViolation(
    error: unknown,
    uplineCode: string,
    leg: Leg,
  ): unknown {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return error;
    }
    const target = Array.isArray(error.meta?.target)
      ? (error.meta.target as string[]).join(',')
      : String(error.meta?.target ?? '');

    if (target.includes('uplineId')) {
      return new PositionTakenError(uplineCode, leg);
    }
    if (target.includes('email')) {
      return new ContactAlreadyUsedError('email');
    }
    if (target.includes('phone')) {
      return new ContactAlreadyUsedError('phone');
    }
    return error; // memberCode : bug de séquence, pas une erreur utilisateur → 500.
  }

  private bcryptRounds(): number {
    return Number(this.config.get<string>('BCRYPT_ROUNDS', '10'));
  }
}
