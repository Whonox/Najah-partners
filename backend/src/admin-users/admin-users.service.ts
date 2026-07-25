import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType, AdminRole, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAdminUserDto,
  ResetAdminPasswordDto,
  UpdateAdminUserDto,
} from './dto/admin-user-input.dto';
import {
  AdminSessionDto,
  AdminSessionsDto,
  AdminUserDto,
} from './dto/admin-user-response.dto';

const DEFAULT_BCRYPT_ROUNDS = 10;

const ADMIN_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} satisfies Prisma.AdminUserSelect;

type AdminRow = Prisma.AdminUserGetPayload<{ select: typeof ADMIN_SELECT }>;

/**
 * Comptes administrateurs et rôles (spec §7.2.12) — réservé au SUPER_ADMIN (le contrôleur le
 * garde) : c'est le module qui distribue les droits, y compris le droit de créer de la valeur.
 *
 * TROIS GARDE-FOUS, tous là pour éviter un état dont on ne sort plus :
 *  1. **on ne se désactive pas soi-même, on ne se dégrade pas soi-même** — l'admin connecté se
 *     couperait l'accès au module qui aurait permis de revenir en arrière ;
 *  2. **le dernier SUPER_ADMIN actif est intouchable** (désactivation comme changement de rôle) :
 *     sans lui, plus personne ne peut créer de valeur, réinitialiser un mot de passe, ni même
 *     rouvrir ce module — la plateforme se verrouille définitivement ;
 *  3. **toute désactivation, tout changement de rôle et tout changement de mot de passe RÉVOQUE
 *     les sessions du compte.** Le refresh recharge bien le rôle en base et refuse un compte
 *     désactivé, mais l'access token déjà émis reste valide jusqu'à son expiration : sans
 *     révocation, un compte « désactivé » garderait ses droits un quart d'heure.
 *
 * Chaque écriture est tracée dans l'AuditLog (qui, quand, avant → après), le mot de passe
 * n'apparaissant évidemment nulle part — on trace le FAIT du changement, jamais sa valeur.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(): Promise<AdminUserDto[]> {
    const admins = await this.prisma.adminUser.findMany({
      select: ADMIN_SELECT,
      orderBy: [{ active: 'desc' }, { id: 'asc' }],
    });

    // Une requête par compte serait un N+1 ; les jetons de TOUS les comptes tiennent en une
    // seule lecture, et il n'y a qu'une poignée d'administrateurs.
    const tokens = await this.prisma.refreshToken.findMany({
      where: { actorType: ActorType.ADMIN, adminUserId: { not: null } },
      select: {
        adminUserId: true,
        createdAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    const now = new Date();
    return admins.map((admin) => {
      const own = tokens.filter((token) => token.adminUserId === admin.id);
      const live = own.filter(
        (token) => !token.revokedAt && token.expiresAt > now,
      );
      const lastLoginAt = own.reduce<Date | null>(
        (latest, token) =>
          !latest || token.createdAt > latest ? token.createdAt : latest,
        null,
      );
      return { ...admin, lastLoginAt, activeSessionCount: live.length };
    });
  }

  async create(
    dto: CreateAdminUserDto,
    actingAdminId: number,
  ): Promise<AdminUserDto> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.adminUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Un compte existe déjà pour ${email}.`);
    }

    const passwordHash = await bcrypt.hash(dto.password, this.rounds());

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          name: dto.name.trim(),
          email,
          role: dto.role,
          passwordHash,
          active: true,
        },
        select: ADMIN_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actor: String(actingAdminId),
          action: 'ADMIN_USER_CREATED',
          target: `AdminUser:${created.id}`,
          before: Prisma.DbNull,
          // Le mot de passe n'entre pas dans l'audit — on trace le FAIT, jamais la valeur.
          after: { name: created.name, email: created.email, role: created.role },
        },
      });
      return { ...created, lastLoginAt: null, activeSessionCount: 0 };
    });
  }

  async update(
    adminUserId: number,
    dto: UpdateAdminUserDto,
    actingAdminId: number,
  ): Promise<AdminUserDto> {
    const before = await this.prisma.adminUser.findUnique({
      where: { id: adminUserId },
      select: ADMIN_SELECT,
    });
    if (!before) {
      throw new NotFoundException(`Compte admin inconnu : ${adminUserId}`);
    }

    const deactivating = dto.active === false && before.active;
    const demoting =
      dto.role !== undefined &&
      dto.role !== before.role &&
      before.role === AdminRole.SUPER_ADMIN;

    if (adminUserId === actingAdminId && (deactivating || demoting)) {
      throw new BadRequestException(
        'Se désactiver ou se retirer le rôle SUPER_ADMIN couperait votre propre accès à ce module.',
      );
    }
    if (deactivating || demoting) {
      await this.assertNotLastSuperAdmin(adminUserId);
    }

    const revokeSessions = deactivating || (dto.role !== undefined && dto.role !== before.role);

    const updated = await this.prisma.$transaction(async (tx) => {
      const after = await tx.adminUser.update({
        where: { id: adminUserId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        select: ADMIN_SELECT,
      });

      if (revokeSessions) {
        // Un rôle changé doit prendre effet MAINTENANT, pas à l'expiration du jeton en cours.
        await tx.refreshToken.updateMany({
          where: { adminUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actor: String(actingAdminId),
          action: 'ADMIN_USER_UPDATED',
          target: `AdminUser:${adminUserId}`,
          before: { name: before.name, role: before.role, active: before.active },
          after: { name: after.name, role: after.role, active: after.active },
        },
      });

      return after;
    });

    // Le décompte des sessions est lu APRÈS le commit : lu dans la transaction, il montrerait
    // encore les jetons que la révocation vient d'annuler.
    return this.withSessionInfo(updated);
  }

  /**
   * Réinitialisation par le SUPER_ADMIN : il POSE un nouveau mot de passe.
   *
   * Pourquoi pas un lien de réinitialisation : il n'existe aucun canal d'envoi (D-011) — le
   * service de reset des membres génère bien un jeton, mais personne ne sait le leur
   * transmettre. Prétendre ici qu'un e-mail part serait faux. Le mot de passe est donc remis en
   * main propre, hors plateforme, et les sessions du compte sont révoquées : si la
   * réinitialisation vient d'un soupçon de compromission, laisser les sessions vivantes
   * n'aurait rien réglé.
   */
  async resetPassword(
    adminUserId: number,
    dto: ResetAdminPasswordDto,
    actingAdminId: number,
  ): Promise<AdminUserDto> {
    const target = await this.prisma.adminUser.findUnique({
      where: { id: adminUserId },
      select: ADMIN_SELECT,
    });
    if (!target) {
      throw new NotFoundException(`Compte admin inconnu : ${adminUserId}`);
    }

    const passwordHash = await bcrypt.hash(dto.password, this.rounds());

    await this.prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: adminUserId },
        data: { passwordHash },
      });
      await tx.refreshToken.updateMany({
        where: { adminUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actor: String(actingAdminId),
          action: 'ADMIN_USER_PASSWORD_RESET',
          target: `AdminUser:${adminUserId}`,
          before: Prisma.DbNull,
          // Aucun mot de passe, ni ancien ni nouveau : on trace que la valeur a changé.
          after: { sessionsRevoked: true },
        },
      });
    });

    return this.withSessionInfo(target);
  }

  /**
   * Journal des SESSIONS d'un compte (§7.2.12), reconstitué depuis les familles de jetons de
   * rafraîchissement (D-016) — la seule trace de connexion réellement écrite en base. Une famille
   * = une session : sa première émission en est l'ouverture, la dernière rotation l'activité la
   * plus récente.
   *
   * Les tentatives ÉCHOUÉES n'y figurent pas : elles ne sont enregistrées nulle part (le champ
   * `failedAttemptsRecorded` le dit explicitement à l'écran, plutôt que de laisser croire à
   * l'absence d'incident).
   */
  async sessions(adminUserId: number): Promise<AdminSessionsDto> {
    const exists = await this.prisma.adminUser.findUnique({
      where: { id: adminUserId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Compte admin inconnu : ${adminUserId}`);
    }

    const tokens = await this.prisma.refreshToken.findMany({
      where: { adminUserId },
      orderBy: { createdAt: 'asc' },
      select: {
        familyId: true,
        createdAt: true,
        revokedAt: true,
        expiresAt: true,
        ip: true,
        userAgent: true,
      },
    });

    const now = new Date();
    const byFamily = new Map<string, AdminSessionDto>();
    for (const token of tokens) {
      const live = !token.revokedAt && token.expiresAt > now;
      const session = byFamily.get(token.familyId);
      if (!session) {
        byFamily.set(token.familyId, {
          familyId: token.familyId,
          startedAt: token.createdAt,
          lastSeenAt: token.createdAt,
          ip: token.ip,
          userAgent: token.userAgent,
          current: live,
          expiresAt: token.expiresAt,
        });
        continue;
      }
      // Rotation : le jeton le plus récent porte l'activité et l'échéance courantes.
      session.lastSeenAt = token.createdAt;
      session.expiresAt = token.expiresAt;
      session.current = live;
      session.ip = token.ip ?? session.ip;
      session.userAgent = token.userAgent ?? session.userAgent;
    }

    return {
      adminUserId,
      sessions: [...byFamily.values()].sort(
        (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
      ),
      failedAttemptsRecorded: false,
    };
  }

  /**
   * Refuse de retirer le dernier SUPER_ADMIN actif. Sans lui, plus personne ne peut créer de
   * valeur, modifier un paramètre système, ni rouvrir ce module : la plateforme serait verrouillée
   * sans recours applicatif.
   */
  private async assertNotLastSuperAdmin(adminUserId: number): Promise<void> {
    const remaining = await this.prisma.adminUser.count({
      where: {
        role: AdminRole.SUPER_ADMIN,
        active: true,
        id: { not: adminUserId },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException(
        'Ce compte est le dernier SUPER_ADMIN actif : le retirer verrouillerait la plateforme.',
      );
    }
  }

  private async withSessionInfo(admin: AdminRow): Promise<AdminUserDto> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { adminUserId: admin.id },
      select: { createdAt: true, revokedAt: true, expiresAt: true },
    });
    const now = new Date();
    return {
      ...admin,
      lastLoginAt: tokens.reduce<Date | null>(
        (latest, token) =>
          !latest || token.createdAt > latest ? token.createdAt : latest,
        null,
      ),
      activeSessionCount: tokens.filter(
        (token) => !token.revokedAt && token.expiresAt > now,
      ).length,
    };
  }

  private rounds(): number {
    const configured = Number(this.config.get<string>('BCRYPT_ROUNDS'));
    return Number.isInteger(configured) && configured > 0
      ? configured
      : DEFAULT_BCRYPT_ROUNDS;
  }
}
