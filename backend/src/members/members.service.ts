import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Leg, MemberStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { MemberCodeService } from './member-code.service';
import {
  ContactAlreadyUsedError,
  MissingContactError,
  PositionTakenError,
  SponsorNotFoundError,
  UplineNotFoundError,
  UplineOutsideSponsorTreeError,
} from './members.errors';
import { RegisterMemberInput, RegisteredMember } from './members.types';
import { PlacementService } from './placement.service';

const TX_TIMEOUT_MS = 10_000;

/**
 * Inscription (spec §5.3, D-013, D-021, D-022).
 *
 * Résultat d'une inscription : un membre INSCRIT, avec son code et sa place définitive dans
 * l'arbre — et RIEN d'autre. Aucun BV n'est injecté, aucune ligne de grand livre n'est
 * écrite : seule l'activation (ActivationService) fait circuler de la valeur.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly placement: PlacementService,
    private readonly memberCode: MemberCodeService,
  ) {}

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
      throw new UplineOutsideSponsorTreeError(upline.memberCode, sponsor.memberCode);
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
              idDocumentPath: input.idDocument?.relativePath ?? null,
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
              },
            },
          });

          return {
            ...member,
            leg: input.leg,
            sponsorCode: sponsor.memberCode,
            uplineCode: upline.memberCode,
          };
        },
        { timeout: TX_TIMEOUT_MS },
      );
    } catch (error) {
      throw this.translateUniqueViolation(error, upline.memberCode, input.leg);
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
