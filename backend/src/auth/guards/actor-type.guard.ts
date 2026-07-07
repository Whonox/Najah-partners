import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType } from '@prisma/client';
import { AuthenticatedActor } from '../auth.types';
import { ACTOR_TYPES_KEY } from '../decorators/actor-type.decorator';

/**
 * Cloisonnement MEMBER / ADMIN (D-016). Rejette (403) tout token dont
 * `actorType` ne figure pas dans les types autorisés par la route.
 */
@Injectable()
export class ActorTypeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<ActorType[]>(
      ACTOR_TYPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed || allowed.length === 0) {
      return true; // route non restreinte par type d'acteur
    }
    const { user } = context.switchToHttp().getRequest<{
      user?: AuthenticatedActor;
    }>();
    if (!user || !allowed.includes(user.actorType)) {
      throw new ForbiddenException("Type d'acteur non autorisé pour cette route");
    }
    return true;
  }
}
