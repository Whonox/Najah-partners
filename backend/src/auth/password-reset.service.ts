import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';
import { durationToMs } from './duration';

/**
 * Récupération de mot de passe pour les MEMBRES (D-011 : périmètre affilié).
 *
 * Aucun fournisseur email/SMS n'existe (notifications in-app uniquement) : cet
 * endpoint génère et persiste un token à usage unique, mais NE l'envoie pas. Le
 * canal de transmission (notification in-app / remise par l'admin) reste à cadrer.
 * En développement, le token est logué pour permettre les tests manuels.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private bcryptRounds(): number {
    return Number(this.config.get<string>('BCRYPT_ROUNDS', '10'));
  }

  /**
   * Demande de réinitialisation. Renvoie toujours sans erreur (anti-énumération) :
   * l'appelant ne peut pas distinguer un identifiant existant d'un inconnu.
   */
  async requestReset(identifier: string): Promise<void> {
    const value = identifier.trim();
    const member = await this.prisma.member.findFirst({
      where: {
        OR: [{ email: value }, { phone: value }, { memberCode: value }],
      },
      select: { id: true },
    });
    if (!member) {
      return; // silencieux : ne pas révéler l'absence de compte
    }

    const token = randomBytes(32).toString('hex');
    const ttl = durationToMs(this.config.get<string>('PASSWORD_RESET_TTL', '1h'));
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: this.hash(token),
        actorType: ActorType.MEMBER,
        memberId: member.id,
        expiresAt: new Date(Date.now() + ttl),
      },
    });

    // Pas d'envoi externe (D-011). Transmission à cadrer (notification in-app).
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(
        `[DEV] Token de reset pour le membre #${member.id} : ${token}`,
      );
    }
  }

  /**
   * Applique un nouveau mot de passe si le token est valide, non expiré et non
   * utilisé. Le token est brûlé (usage unique) et toutes les sessions du membre
   * sont révoquées.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now() ||
      record.actorType !== ActorType.MEMBER ||
      record.memberId == null
    ) {
      throw new BadRequestException('Token de réinitialisation invalide ou expiré');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds());

    await this.prisma.$transaction([
      this.prisma.member.update({
        where: { id: record.memberId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Sécurité : invalider toutes les sessions ouvertes du membre.
    await this.tokens.revokeAllForActor({
      id: record.memberId,
      actorType: ActorType.MEMBER,
    });
  }
}
