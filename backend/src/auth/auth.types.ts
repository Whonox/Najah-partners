import { ActorType, AdminRole } from '@prisma/client';

/**
 * Contenu du JWT d'accès. `actorType` cloisonne strictement MEMBER et ADMIN
 * (D-016) : un token MEMBER ne franchit jamais un guard ADMIN, et inversement.
 */
export interface JwtPayload {
  sub: number; // id de l'acteur (Member.id ou AdminUser.id)
  actorType: ActorType;
  role?: AdminRole; // présent uniquement pour ADMIN
}

/**
 * Acteur authentifié attaché à `request.user` par la stratégie d'accès.
 */
export interface AuthenticatedActor {
  id: number;
  actorType: ActorType;
  role?: AdminRole;
}
