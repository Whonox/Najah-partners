import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType, AdminRole } from '@prisma/client';
import { StepUpRequiredError } from '../../members/onboarding/step-up.errors';
import { StepUpService } from '../../members/onboarding/step-up.service';
import {
  REQUIRE_STEP_UP_KEY,
  STEP_UP_HEADER,
} from '../decorators/require-step-up.decorator';
import { AuthenticatedActor } from '../auth.types';
import { StepUpGuard } from './step-up.guard';

/**
 * Ce que ces tests tiennent :
 *  — le DÉFAUT est OUVERT, contrairement au garde d'accueil : seules les routes marquées
 *    `@RequireStepUp()` sont fermées. C'est assumé (D-058) — exiger un PIN pour consulter son
 *    arbre ferait d'un garde-fou une nuisance ;
 *  — le jeton est LIÉ au membre : celui d'un compte ne couvre pas les opérations d'un autre ;
 *  — ce garde NE COMPTE AUCUN ESSAI. Compter ici permettrait de bloquer un membre en lui
 *    envoyant des jetons bidons — un déni de service gratuit. Le test vérifie qu'aucune
 *    écriture n'est déclenchée.
 */

function makeContext(
  user: AuthenticatedActor | undefined,
  headers: Record<string, string | string[] | undefined> = {},
): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user, headers }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(options: { required?: boolean; validFor?: number }) {
  const isTokenValidFor = jest.fn(
    (_token: string, memberId: number) => options.validFor === memberId,
  );
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === REQUIRE_STEP_UP_KEY ? options.required : undefined,
  } as unknown as Reflector;
  const stepUp = { isTokenValidFor } as unknown as StepUpService;
  return { guard: new StepUpGuard(reflector, stepUp), isTokenValidFor };
}

const MEMBER: AuthenticatedActor = { id: 42, actorType: ActorType.MEMBER };
const ADMIN: AuthenticatedActor = {
  id: 7,
  actorType: ActorType.ADMIN,
  role: AdminRole.SUPER_ADMIN,
};

describe('StepUpGuard', () => {
  it('DÉFAUT OUVERT : une route non marquée passe sans jeton', () => {
    const { guard, isTokenValidFor } = makeGuard({ required: undefined });
    expect(guard.canActivate(makeContext(MEMBER))).toBe(true);
    expect(isTokenValidFor).not.toHaveBeenCalled();
  });

  it('ferme une route marquée quand aucun jeton n’est présenté', () => {
    const { guard } = makeGuard({ required: true });
    expect(() => guard.canActivate(makeContext(MEMBER))).toThrow(
      StepUpRequiredError,
    );
  });

  it('porte un code exploitable par le portail pour ouvrir la boîte de dialogue', () => {
    const { guard } = makeGuard({ required: true });
    try {
      guard.canActivate(makeContext(MEMBER));
      fail('le garde aurait dû refuser');
    } catch (error) {
      expect((error as StepUpRequiredError).getResponse()).toMatchObject({
        code: 'STEP_UP_REQUIRED',
      });
    }
  });

  it('laisse passer avec un jeton valide pour CE membre', () => {
    const { guard } = makeGuard({ required: true, validFor: 42 });
    expect(
      guard.canActivate(makeContext(MEMBER, { [STEP_UP_HEADER]: 'jeton' })),
    ).toBe(true);
  });

  it('refuse le jeton d’un AUTRE membre', () => {
    const { guard } = makeGuard({ required: true, validFor: 99 });
    expect(() =>
      guard.canActivate(makeContext(MEMBER, { [STEP_UP_HEADER]: 'jeton' })),
    ).toThrow(StepUpRequiredError);
  });

  it('ne concerne pas les acteurs ADMIN — leur surface est cloisonnée par le RBAC', () => {
    const { guard, isTokenValidFor } = makeGuard({ required: true });
    expect(guard.canActivate(makeContext(ADMIN))).toBe(true);
    expect(isTokenValidFor).not.toHaveBeenCalled();
  });

  it('accepte un en-tête répété (le premier fait foi)', () => {
    const { guard } = makeGuard({ required: true, validFor: 42 });
    expect(
      guard.canActivate(
        makeContext(MEMBER, { [STEP_UP_HEADER]: ['jeton', 'autre'] }),
      ),
    ).toBe(true);
  });
});
