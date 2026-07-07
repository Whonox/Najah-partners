import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * RBAC admin : restreint une route à certains rôles (SUPER_ADMIN / MANAGER / SUPPORT).
 * N'a de sens que sur une route déjà réservée aux ADMIN.
 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
