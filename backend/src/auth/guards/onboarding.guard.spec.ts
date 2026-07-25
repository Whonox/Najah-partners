import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType, AdminRole } from '@prisma/client';
import { OnboardingRequiredError } from '../../members/onboarding/onboarding.errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ALLOW_INCOMPLETE_ONBOARDING_KEY } from '../decorators/allow-incomplete-onboarding.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedActor } from '../auth.types';
import { OnboardingGuard } from './onboarding.guard';

/**
 * Ce que ces tests tiennent :
 *  — le blocage du parcours d'accueil est SERVEUR (D-057). Un test qui passerait sans lui
 *    signifierait que la règle est retombée côté écran, où elle ne garantit rien ;
 *  — le DÉFAUT est FERMÉ : une route sans décorateur est bloquée. C'est ce qui rend l'oubli
 *    d'un développeur sûr — l'inverse (une liste de routes à bloquer) laisserait passer tout
 *    ce qu'on oublie d'y inscrire ;
 *  — les trois exemptions nécessaires — routes publiques, acteurs ADMIN, routes marquées —
 *    passent, sans quoi le membre serait enfermé dehors : il lui faudrait avoir terminé le
 *    parcours pour pouvoir le commencer ;
 *  — un membre introuvable n'est PAS renvoyé vers le parcours : ce serait un message faux.
 */

function makeContext(user?: AuthenticatedActor): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(options: {
  metadata?: Record<string, boolean>;
  member?: { onboardingCompletedAt: Date | null } | null;
}) {
  const findUnique = jest.fn(() => Promise.resolve(options.member ?? null));
  const reflector = {
    getAllAndOverride: (key: string) => options.metadata?.[key],
  } as unknown as Reflector;
  const prisma = {
    member: { findUnique },
  } as unknown as PrismaService;
  return { guard: new OnboardingGuard(reflector, prisma), findUnique };
}

const MEMBER: AuthenticatedActor = { id: 42, actorType: ActorType.MEMBER };
const ADMIN: AuthenticatedActor = {
  id: 7,
  actorType: ActorType.ADMIN,
  role: AdminRole.SUPER_ADMIN,
};

describe('OnboardingGuard', () => {
  it('bloque un membre dont le parcours n’est pas terminé', async () => {
    const { guard } = makeGuard({ member: { onboardingCompletedAt: null } });
    await expect(guard.canActivate(makeContext(MEMBER))).rejects.toBeInstanceOf(
      OnboardingRequiredError,
    );
  });

  it('porte un code exploitable par le portail — un 403 nu serait indistinguable d’un refus de droits', async () => {
    const { guard } = makeGuard({ member: { onboardingCompletedAt: null } });
    await expect(guard.canActivate(makeContext(MEMBER))).rejects.toMatchObject({
      response: { code: 'ONBOARDING_REQUIRED' },
    });
  });

  it('laisse passer un membre dont le parcours est terminé', async () => {
    const { guard } = makeGuard({
      member: { onboardingCompletedAt: new Date() },
    });
    await expect(guard.canActivate(makeContext(MEMBER))).resolves.toBe(true);
  });

  it('ne touche pas aux routes publiques — et ne lit même pas la base', async () => {
    const { guard, findUnique } = makeGuard({
      metadata: { [IS_PUBLIC_KEY]: true },
      member: { onboardingCompletedAt: null },
    });
    await expect(guard.canActivate(makeContext(MEMBER))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('ne touche pas aux routes explicitement exemptées (le parcours lui-même)', async () => {
    const { guard, findUnique } = makeGuard({
      metadata: { [ALLOW_INCOMPLETE_ONBOARDING_KEY]: true },
      member: { onboardingCompletedAt: null },
    });
    await expect(guard.canActivate(makeContext(MEMBER))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('ne concerne pas les acteurs ADMIN — le back-office n’a pas de parcours d’accueil', async () => {
    const { guard, findUnique } = makeGuard({ member: null });
    await expect(guard.canActivate(makeContext(ADMIN))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('laisse passer quand aucun acteur n’est attaché', async () => {
    const { guard } = makeGuard({ member: null });
    await expect(guard.canActivate(makeContext(undefined))).resolves.toBe(true);
  });

  it('ne renvoie pas un membre INTROUVABLE vers le parcours — le contrôleur rendra son 404', async () => {
    const { guard } = makeGuard({ member: null });
    await expect(guard.canActivate(makeContext(MEMBER))).resolves.toBe(true);
  });

  it('DÉFAUT FERMÉ : sans aucun décorateur, un parcours inachevé est bloqué', async () => {
    const { guard } = makeGuard({
      metadata: {}, // aucune métadonnée : le cas d'une route qu'on a oublié de classer
      member: { onboardingCompletedAt: null },
    });
    await expect(guard.canActivate(makeContext(MEMBER))).rejects.toBeInstanceOf(
      OnboardingRequiredError,
    );
  });
});
