import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Exclut une route du guard d'authentification global (login, refresh, etc.).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
