import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType, AdminRole } from '@prisma/client';
import { AuthenticatedActor } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RBAC admin. N'autorise que les ADMIN dont le rôle figure dans la liste requise.
 * Un MEMBER (sans rôle) est rejeté d'office sur une route à rôle.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // route sans contrainte de rôle
    }
    const { user } = context.switchToHttp().getRequest<{
      user?: AuthenticatedActor;
    }>();
    if (
      !user ||
      user.actorType !== ActorType.ADMIN ||
      !user.role ||
      !requiredRoles.includes(user.role)
    ) {
      throw new ForbiddenException('Rôle insuffisant pour cette route');
    }
    return true;
  }
}
