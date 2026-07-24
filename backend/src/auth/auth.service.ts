import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ActorType, AdminRole, Member } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedActor } from './auth.types';

/** Vue publique d'un membre (ni hash de mot de passe, ni chemin de pièce d'identité). */
export type SafeMember = Omit<Member, 'passwordHash' | 'idDocumentPath'>;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private stripMember(member: Member): SafeMember {
    const {
      passwordHash: _passwordHash,
      idDocumentPath: _idDocumentPath, // chemin de la pièce d'identité : jamais exposé (D-018)
      ...safe
    } = member;
    return safe;
  }

  /**
   * Résout un membre par identifiant unique : e-mail, puis téléphone, puis code
   * membre (tous uniques). Vérifie le mot de passe. En cas d'échec (identifiant
   * inconnu OU mauvais mot de passe), lève toujours la MÊME erreur générique
   * pour ne pas révéler l'existence d'un compte (spec §5.10).
   */
  async validateMember(
    identifier: string,
    password: string,
  ): Promise<AuthenticatedActor & { member: SafeMember }> {
    const value = identifier.trim();
    const member = await this.prisma.member.findFirst({
      where: {
        OR: [{ email: value }, { phone: value }, { memberCode: value }],
      },
    });

    // Compare toujours contre un hash pour limiter l'oracle temporel, même si le
    // membre n'existe pas.
    const hash = member?.passwordHash ?? DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash);
    if (!member || !ok) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    return {
      id: member.id,
      actorType: ActorType.MEMBER,
      member: this.stripMember(member),
    };
  }

  /** Authentifie un AdminUser par e-mail + mot de passe. Erreur générique. */
  async validateAdmin(
    email: string,
    password: string,
  ): Promise<AuthenticatedActor> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: email.trim() },
    });
    const hash = admin?.passwordHash ?? DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash);
    if (!admin || !ok || !admin.active) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    return { id: admin.id, actorType: ActorType.ADMIN, role: admin.role };
  }

  /**
   * Profil de l'admin connecté (nom, e-mail, rôle) — ce que le back-office affiche dans son
   * en-tête. Le JWT ne porte que l'id et le rôle : l'identité lisible vient de la base, jamais
   * du token (un token reste valide ~15 min après un renommage ou une désactivation).
   *
   * Un compte désactivé entre-temps se voit refusé ici, même si son access token n'a pas encore
   * expiré : c'est la première requête de chaque chargement du back-office.
   */
  async getAdminProfile(adminId: number): Promise<AdminProfile> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (!admin || !admin.active) {
      throw new UnauthorizedException('Compte administrateur indisponible');
    }
    const { active: _active, ...profile } = admin;
    return profile;
  }
}

/** Identité lisible d'un administrateur (jamais le hash, jamais les permissions brutes). */
export interface AdminProfile {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
}

/**
 * Hash bcrypt factice (mot de passe "*") comparé lorsque le compte est introuvable,
 * afin que le temps de réponse ne trahisse pas l'existence d'un identifiant.
 */
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8i0zLZ3aB0q4o8s3Q7bXxY7m2p6Vi';
