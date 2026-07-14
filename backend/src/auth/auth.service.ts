import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ActorType, Member } from '@prisma/client';
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
}

/**
 * Hash bcrypt factice (mot de passe "*") comparé lorsque le compte est introuvable,
 * afin que le temps de réponse ne trahisse pas l'existence d'un identifiant.
 */
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8i0zLZ3aB0q4o8s3Q7bXxY7m2p6Vi';
