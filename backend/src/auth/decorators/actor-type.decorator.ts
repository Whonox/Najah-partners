import { SetMetadata } from '@nestjs/common';
import { ActorType } from '@prisma/client';

export const ACTOR_TYPES_KEY = 'actorTypes';

/**
 * Restreint une route à un ou plusieurs types d'acteur (MEMBER / ADMIN).
 * Un token du mauvais type est rejeté (403) — cloisonnement D-016.
 */
export const RequireActor = (...actorTypes: ActorType[]) =>
  SetMetadata(ACTOR_TYPES_KEY, actorTypes);
