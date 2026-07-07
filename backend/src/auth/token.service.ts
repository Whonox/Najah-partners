import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ActorType } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedActor, JwtPayload } from './auth.types';
import { durationToMs } from './duration';

export interface RefreshContext {
  userAgent?: string;
  ip?: string;
}

export interface IssuedRefresh {
  token: string; // valeur en clair (à poser en cookie, jamais persistée)
  expiresAt: Date;
}

/**
 * Émission des access tokens (JWT) et gestion des refresh tokens.
 *
 * Le refresh token est un secret aléatoire opaque : seul son hash SHA-256 est
 * stocké. Rotation à chaque usage + détection de réutilisation par famille
 * (le rejeu d'un token révoqué révoque toute la session — anti-vol, D-016).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Signe un access token court à partir de l'acteur authentifié. */
  signAccessToken(actor: AuthenticatedActor): string {
    const payload: JwtPayload = {
      sub: actor.id,
      actorType: actor.actorType,
      role: actor.role,
    };
    const options = {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
    } as unknown as JwtSignOptions;
    return this.jwt.sign(payload, options);
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTtlMs(): number {
    return durationToMs(this.config.get<string>('JWT_REFRESH_TTL', '7d'));
  }

  /**
   * Crée un refresh token dans une famille donnée (nouvelle session si absente).
   */
  async issueRefreshToken(
    actor: AuthenticatedActor,
    ctx: RefreshContext = {},
    familyId?: string,
  ): Promise<IssuedRefresh> {
    const token = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({
      data: {
        familyId: familyId ?? randomBytes(16).toString('hex'),
        tokenHash: this.hash(token),
        actorType: actor.actorType,
        memberId: actor.actorType === ActorType.MEMBER ? actor.id : null,
        adminUserId: actor.actorType === ActorType.ADMIN ? actor.id : null,
        expiresAt,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    });
    return { token, expiresAt };
  }

  /**
   * Valide un refresh token présenté, le révoque, et en émet un nouveau dans la
   * même famille. Détecte la réutilisation d'un token déjà révoqué : dans ce cas
   * toute la famille est révoquée et l'accès est refusé.
   */
  async rotateRefreshToken(
    presentedToken: string,
    ctx: RefreshContext = {},
  ): Promise<{ actor: AuthenticatedActor; refresh: IssuedRefresh; accessToken: string }> {
    const tokenHash = this.hash(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    // Réutilisation d'un token déjà révoqué → vol probable : on coupe la session.
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Refresh token invalide');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expiré');
    }

    const actor = await this.enrichActor(this.actorFromToken(existing));

    // Rotation : on révoque l'ancien puis on émet le nouveau (même famille).
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    const refresh = await this.issueRefreshToken(actor, ctx, existing.familyId);
    const accessToken = this.signAccessToken(actor);
    return { actor, refresh, accessToken };
  }

  /** Logout : révoque le refresh présenté (idempotent). */
  async revokeRefreshToken(presentedToken: string): Promise<void> {
    const tokenHash = this.hash(presentedToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Révoque toutes les sessions actives d'un acteur (ex. reset de mot de passe). */
  async revokeAllForActor(actor: AuthenticatedActor): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        revokedAt: null,
        ...(actor.actorType === ActorType.MEMBER
          ? { memberId: actor.id }
          : { adminUserId: actor.id }),
      },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Recharge le rôle courant d'un ADMIN (source de vérité en base) pour que le
   * nouvel access token reflète tout changement de rôle depuis le login.
   * Un ADMIN désactivé voit son refresh refusé.
   */
  private async enrichActor(
    actor: AuthenticatedActor,
  ): Promise<AuthenticatedActor> {
    if (actor.actorType !== ActorType.ADMIN) {
      return actor;
    }
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: actor.id },
      select: { role: true, active: true },
    });
    if (!admin || !admin.active) {
      throw new UnauthorizedException('Compte administrateur indisponible');
    }
    return { ...actor, role: admin.role };
  }

  private actorFromToken(token: {
    actorType: ActorType;
    memberId: number | null;
    adminUserId: number | null;
  }): AuthenticatedActor {
    if (token.actorType === ActorType.MEMBER && token.memberId != null) {
      return { id: token.memberId, actorType: ActorType.MEMBER };
    }
    if (token.actorType === ActorType.ADMIN && token.adminUserId != null) {
      // Le rôle est rechargé au login (source de vérité) ; le refresh ne fige
      // pas le rôle. On le rechargera via AuthService lors du besoin.
      return { id: token.adminUserId, actorType: ActorType.ADMIN };
    }
    throw new UnauthorizedException('Refresh token incohérent');
  }
}
