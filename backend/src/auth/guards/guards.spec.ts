import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType, AdminRole } from '@prisma/client';
import { AuthenticatedActor } from '../auth.types';
import { ActorTypeGuard } from './actor-type.guard';
import { RolesGuard } from './roles.guard';

function ctxWithUser(user?: AuthenticatedActor): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: unknown): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(value),
  } as unknown as Reflector;
}

const MEMBER: AuthenticatedActor = { id: 1, actorType: ActorType.MEMBER };
const ADMIN: AuthenticatedActor = {
  id: 2,
  actorType: ActorType.ADMIN,
  role: AdminRole.MANAGER,
};

describe('ActorTypeGuard — cloisonnement MEMBER / ADMIN (D-016)', () => {
  it('laisse passer un ADMIN sur une route ADMIN', () => {
    const guard = new ActorTypeGuard(reflectorReturning([ActorType.ADMIN]));
    expect(guard.canActivate(ctxWithUser(ADMIN))).toBe(true);
  });

  it('rejette un MEMBER sur une route ADMIN', () => {
    const guard = new ActorTypeGuard(reflectorReturning([ActorType.ADMIN]));
    expect(() => guard.canActivate(ctxWithUser(MEMBER))).toThrow(
      ForbiddenException,
    );
  });

  it('rejette un ADMIN sur une route MEMBER', () => {
    const guard = new ActorTypeGuard(reflectorReturning([ActorType.MEMBER]));
    expect(() => guard.canActivate(ctxWithUser(ADMIN))).toThrow(
      ForbiddenException,
    );
  });

  it('laisse passer si aucune contrainte de type', () => {
    const guard = new ActorTypeGuard(reflectorReturning(undefined));
    expect(guard.canActivate(ctxWithUser(MEMBER))).toBe(true);
  });
});

describe('RolesGuard — RBAC admin', () => {
  it('autorise un admin dont le rôle est requis', () => {
    const guard = new RolesGuard(reflectorReturning([AdminRole.MANAGER]));
    expect(guard.canActivate(ctxWithUser(ADMIN))).toBe(true);
  });

  it('rejette un admin dont le rôle n’est pas requis', () => {
    const guard = new RolesGuard(reflectorReturning([AdminRole.SUPER_ADMIN]));
    expect(() => guard.canActivate(ctxWithUser(ADMIN))).toThrow(
      ForbiddenException,
    );
  });

  it('rejette un MEMBER sur une route à rôle admin', () => {
    const guard = new RolesGuard(reflectorReturning([AdminRole.SUPPORT]));
    expect(() => guard.canActivate(ctxWithUser(MEMBER))).toThrow(
      ForbiddenException,
    );
  });

  it('laisse passer si aucun rôle requis', () => {
    const guard = new RolesGuard(reflectorReturning(undefined));
    expect(guard.canActivate(ctxWithUser(ADMIN))).toBe(true);
  });
});
