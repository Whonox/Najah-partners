import { UnauthorizedException } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const PASSWORD = 'S3cret!pass';

function buildMember(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    memberCode: 'NP001024',
    lastName: 'Ben Salah',
    firstName: 'Mohamed',
    email: 'mohamed@example.tn',
    phone: '+21620123456',
    passwordHash: bcrypt.hashSync(PASSWORD, 10),
    status: 'REGISTERED',
    ...overrides,
  };
}

/**
 * Émule la résolution SQL `findFirst({ OR: [{email},{phone},{memberCode}] })`
 * pour un seul membre : renvoie le membre si l'identifiant correspond à l'un des
 * trois champs uniques.
 */
function makePrisma(member: ReturnType<typeof buildMember> | null) {
  return {
    member: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (!member) return null;
        const value = where.OR[0].email as string;
        const match =
          member.email === value ||
          member.phone === value ||
          member.memberCode === value;
        return match ? member : null;
      }),
    },
    adminUser: {
      findUnique: jest.fn(async () => null),
    },
  } as unknown as PrismaService;
}

describe('AuthService — connexion affilié (3 identifiants)', () => {
  it.each([
    ['email', 'mohamed@example.tn'],
    ['téléphone', '+21620123456'],
    ['code membre', 'NP001024'],
  ])('accepte la connexion par %s + mot de passe correct', async (_label, identifier) => {
    const service = new AuthService(makePrisma(buildMember()));
    const result = await service.validateMember(identifier, PASSWORD);
    expect(result.id).toBe(42);
    expect(result.actorType).toBe(ActorType.MEMBER);
    expect(result.member).not.toHaveProperty('passwordHash');
  });

  it('rejette un mot de passe incorrect (erreur générique)', async () => {
    const service = new AuthService(makePrisma(buildMember()));
    await expect(
      service.validateMember('NP001024', 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un identifiant inconnu avec la même erreur générique', async () => {
    const service = new AuthService(makePrisma(null));
    await expect(
      service.validateMember('ghost@example.tn', PASSWORD),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService — connexion admin', () => {
  function makeAdminPrisma(admin: Record<string, unknown> | null) {
    return {
      member: { findFirst: jest.fn(async () => null) },
      adminUser: { findUnique: jest.fn(async () => admin) },
    } as unknown as PrismaService;
  }

  it('accepte un admin actif avec le bon mot de passe et expose son rôle', async () => {
    const prisma = makeAdminPrisma({
      id: 1,
      email: 'admin@najah.local',
      passwordHash: bcrypt.hashSync(PASSWORD, 10),
      role: 'SUPER_ADMIN',
      active: true,
    });
    const service = new AuthService(prisma);
    const actor = await service.validateAdmin('admin@najah.local', PASSWORD);
    expect(actor).toEqual({
      id: 1,
      actorType: ActorType.ADMIN,
      role: 'SUPER_ADMIN',
    });
  });

  it('rejette un admin désactivé', async () => {
    const prisma = makeAdminPrisma({
      id: 1,
      email: 'admin@najah.local',
      passwordHash: bcrypt.hashSync(PASSWORD, 10),
      role: 'MANAGER',
      active: false,
    });
    const service = new AuthService(prisma);
    await expect(
      service.validateAdmin('admin@najah.local', PASSWORD),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('expose le profil admin (nom, e-mail, rôle) sans le drapeau `active`', async () => {
    const prisma = makeAdminPrisma({
      id: 1,
      name: 'Amine Trabelsi',
      email: 'admin@najah.local',
      role: 'SUPER_ADMIN',
      active: true,
    });
    const service = new AuthService(prisma);

    await expect(service.getAdminProfile(1)).resolves.toEqual({
      id: 1,
      name: 'Amine Trabelsi',
      email: 'admin@najah.local',
      role: 'SUPER_ADMIN',
    });
  });

  it('refuse le profil d’un admin désactivé, même avec un token encore valide', async () => {
    const prisma = makeAdminPrisma({
      id: 1,
      name: 'Amine Trabelsi',
      email: 'admin@najah.local',
      role: 'MANAGER',
      active: false,
    });
    const service = new AuthService(prisma);

    await expect(service.getAdminProfile(1)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
