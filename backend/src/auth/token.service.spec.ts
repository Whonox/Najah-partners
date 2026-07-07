import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedActor } from './auth.types';
import { TokenService } from './token.service';

interface Row {
  id: number;
  familyId: string;
  tokenHash: string;
  actorType: ActorType;
  memberId: number | null;
  adminUserId: number | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Fake en mémoire de la table RefreshToken pour tester la rotation. */
function makePrisma() {
  const store: Row[] = [];
  let seq = 1;
  const matches = (row: Row, where: any) =>
    (where.tokenHash === undefined || row.tokenHash === where.tokenHash) &&
    (where.familyId === undefined || row.familyId === where.familyId) &&
    (where.memberId === undefined || row.memberId === where.memberId) &&
    (where.adminUserId === undefined || row.adminUserId === where.adminUserId) &&
    (where.revokedAt !== null || row.revokedAt === null);

  const prisma = {
    _store: store,
    refreshToken: {
      create: jest.fn(async ({ data }: any) => {
        const row: Row = { id: seq++, revokedAt: null, ...data };
        store.push(row);
        return row;
      }),
      findUnique: jest.fn(
        async ({ where }: any) =>
          store.find((r) => r.tokenHash === where.tokenHash) ?? null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = store.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of store) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      }),
    },
    adminUser: {
      findUnique: jest.fn(async () => ({ role: 'MANAGER', active: true })),
    },
  } as unknown as PrismaService & { _store: Row[] };
  return prisma;
}

function makeConfig() {
  return {
    getOrThrow: jest.fn(() => 'test-secret'),
    get: jest.fn((key: string, def?: string) => {
      if (key === 'JWT_ACCESS_TTL') return '15m';
      if (key === 'JWT_REFRESH_TTL') return '7d';
      return def;
    }),
  } as unknown as ConfigService;
}

const MEMBER: AuthenticatedActor = { id: 7, actorType: ActorType.MEMBER };

function build() {
  const prisma = makePrisma();
  const service = new TokenService(prisma, new JwtService({}), makeConfig());
  return { prisma, service };
}

describe('TokenService', () => {
  it('signe un access token décodable portant actorType et id', () => {
    const { service } = build();
    const jwt = new JwtService({});
    const token = service.signAccessToken({
      id: 1,
      actorType: ActorType.ADMIN,
      role: 'SUPER_ADMIN',
    });
    const decoded = jwt.decode(token) as any;
    expect(decoded.sub).toBe(1);
    expect(decoded.actorType).toBe(ActorType.ADMIN);
    expect(decoded.role).toBe('SUPER_ADMIN');
  });

  it('émet un refresh persisté hashé (jamais en clair)', async () => {
    const { prisma, service } = build();
    const { token } = await service.issueRefreshToken(MEMBER);
    expect(prisma._store).toHaveLength(1);
    expect(prisma._store[0].tokenHash).not.toBe(token); // stocké hashé
    expect(prisma._store[0].revokedAt).toBeNull();
  });

  it('rotation : révoque l’ancien refresh et en émet un nouveau (même famille)', async () => {
    const { prisma, service } = build();
    const { token: t1 } = await service.issueRefreshToken(MEMBER);
    const familyId = prisma._store[0].familyId;

    const { refresh, accessToken } = await service.rotateRefreshToken(t1);
    expect(accessToken).toBeDefined();
    expect(refresh.token).not.toBe(t1);
    expect(prisma._store[0].revokedAt).not.toBeNull(); // ancien révoqué
    expect(prisma._store[1].familyId).toBe(familyId); // même famille
    expect(prisma._store[1].revokedAt).toBeNull();
  });

  it('détection de réutilisation : rejouer un refresh révoqué révoque toute la famille', async () => {
    const { prisma, service } = build();
    const { token: t1 } = await service.issueRefreshToken(MEMBER);
    const { refresh } = await service.rotateRefreshToken(t1); // t1 révoqué, refresh actif

    // Rejeu de t1 (déjà révoqué) → vol présumé
    await expect(service.rotateRefreshToken(t1)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // Le token issu de la rotation est lui aussi révoqué
    const active = prisma._store.filter((r) => r.revokedAt === null);
    expect(active).toHaveLength(0);
    // sanity : refresh.token n'est plus utilisable
    await expect(
      service.rotateRefreshToken(refresh.token),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuse un refresh expiré', async () => {
    const { prisma, service } = build();
    const { token } = await service.issueRefreshToken(MEMBER);
    prisma._store[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.rotateRefreshToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout : révoque le refresh présenté', async () => {
    const { prisma, service } = build();
    const { token } = await service.issueRefreshToken(MEMBER);
    await service.revokeRefreshToken(token);
    expect(prisma._store[0].revokedAt).not.toBeNull();
    await expect(service.rotateRefreshToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuse un refresh inconnu', async () => {
    const { service } = build();
    await expect(
      service.rotateRefreshToken('inexistant'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
