import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedActor } from '../auth.types';

/**
 * Injecte l'acteur authentifié (`request.user`) dans un handler.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedActor => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedActor;
  },
);
