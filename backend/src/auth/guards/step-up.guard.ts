import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType } from '@prisma/client';
import { StepUpService } from '../../members/onboarding/step-up.service';
import { StepUpRequiredError } from '../../members/onboarding/step-up.errors';
import {
  REQUIRE_STEP_UP_KEY,
  STEP_UP_HEADER,
} from '../decorators/require-step-up.decorator';
import { AuthenticatedActor } from '../auth.types';

/**
 * Seconde authentification des opérations sensibles (D-051, D-058).
 *
 * ═══ POURQUOI CÔTÉ SERVEUR ═══
 * Une boîte de dialogue de PIN qui garde un écran ne garde rien : la même donnée s'obtient
 * par un appel direct à l'API. La règle vit donc ici, et le portail ne fait qu'anticiper ce
 * que le backend exigera de toute façon.
 *
 * ═══ LE JETON EST LIÉ AU MEMBRE ═══
 * `isTokenValidFor` compare le `sub` du jeton à l'acteur de la requête : un jeton légitimement
 * obtenu par un compte ne peut pas couvrir les opérations d'un autre.
 *
 * ═══ CE GARDE NE COMPTE AUCUN ESSAI ═══
 * Il constate la présence d'un jeton valide, rien de plus. Les essais — et le blocage — se
 * comptent là où l'on tente réellement de prouver son identité (`StepUpService.verify`).
 * Compter ici permettrait de faire monter le compteur d'un membre, jusqu'à le bloquer, en
 * lui envoyant des jetons bidons : un déni de service gratuit.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly stepUp: StepUpService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_STEP_UP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedActor;
      headers: Record<string, string | string[] | undefined>;
    }>();

    // Les acteurs ADMIN ne passent pas par la seconde authentification : leur surface est
    // déjà cloisonnée par le RBAC (D-017b) et ne partage aucune de ces routes.
    const user = request.user;
    if (!user || user.actorType !== ActorType.MEMBER) return true;

    const header = request.headers[STEP_UP_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || !this.stepUp.isTokenValidFor(token, user.id)) {
      throw new StepUpRequiredError();
    }
    return true;
  }
}
