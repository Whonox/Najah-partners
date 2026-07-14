import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';
import { TokenService } from './token.service';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

function makeConfig() {
  return {
    get: jest.fn((key: string, def?: string) => {
      if (key === 'PASSWORD_RESET_TTL') return '1h';
      if (key === 'BCRYPT_ROUNDS') return '10';
      if (key === 'NODE_ENV') return 'test';
      return def;
    }),
  } as unknown as ConfigService;
}

function makeTokens() {
  return { revokeAllForActor: jest.fn(async () => undefined) } as unknown as TokenService;
}

describe('PasswordResetService — demande', () => {
  it('reste silencieux pour un identifiant inconnu (anti-énumération)', async () => {
    const create = jest.fn();
    const prisma = {
      member: { findFirst: jest.fn(async () => null) },
      passwordResetToken: { create },
    } as unknown as PrismaService;
    const service = new PasswordResetService(prisma, makeConfig(), makeTokens());
    await expect(service.requestReset('ghost@example.tn')).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it('crée un token hashé pour un membre existant', async () => {
    const create = jest.fn(async (..._args: unknown[]) => ({}));
    const prisma = {
      member: { findFirst: jest.fn(async () => ({ id: 9 })) },
      passwordResetToken: { create },
    } as unknown as PrismaService;
    const service = new PasswordResetService(prisma, makeConfig(), makeTokens());
    await service.requestReset('NP000009');
    expect(create).toHaveBeenCalledTimes(1);
    const data = (create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.actorType).toBe(ActorType.MEMBER);
    expect(data.memberId).toBe(9);
    expect(typeof data.tokenHash).toBe('string');
  });
});

describe('PasswordResetService — reset', () => {
  function makePrisma(record: any) {
    const memberUpdate = jest.fn(async () => ({}));
    const tokenUpdate = jest.fn(async () => ({}));
    const prisma = {
      passwordResetToken: {
        findUnique: jest.fn(async () => record),
        update: tokenUpdate,
      },
      member: { update: memberUpdate },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    } as unknown as PrismaService;
    return { prisma, memberUpdate, tokenUpdate };
  }

  const validRecord = {
    id: 1,
    tokenHash: sha('good-token'),
    actorType: ActorType.MEMBER,
    memberId: 9,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  };

  it('applique le nouveau mot de passe, brûle le token et révoque les sessions', async () => {
    const { prisma, memberUpdate, tokenUpdate } = makePrisma(validRecord);
    const tokens = makeTokens();
    const service = new PasswordResetService(prisma, makeConfig(), tokens);
    await service.resetPassword('good-token', 'newStrongPass1');
    expect(memberUpdate).toHaveBeenCalledTimes(1);
    expect(tokenUpdate).toHaveBeenCalledTimes(1); // usedAt posé
    expect(tokens.revokeAllForActor).toHaveBeenCalledWith({
      id: 9,
      actorType: ActorType.MEMBER,
    });
  });

  it('rejette un token déjà utilisé (usage unique)', async () => {
    const { prisma } = makePrisma({ ...validRecord, usedAt: new Date() });
    const service = new PasswordResetService(prisma, makeConfig(), makeTokens());
    await expect(
      service.resetPassword('good-token', 'newStrongPass1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un token expiré', async () => {
    const { prisma } = makePrisma({
      ...validRecord,
      expiresAt: new Date(Date.now() - 1000),
    });
    const service = new PasswordResetService(prisma, makeConfig(), makeTokens());
    await expect(
      service.resetPassword('good-token', 'newStrongPass1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un token inexistant', async () => {
    const { prisma } = makePrisma(null);
    const service = new PasswordResetService(prisma, makeConfig(), makeTokens());
    await expect(
      service.resetPassword('nope', 'newStrongPass1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
