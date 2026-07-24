import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';

/**
 * Miroir de doc des réponses d'authentification. Le plugin CLI `@nestjs/swagger` infère
 * beaucoup de schémas, mais pas les objets littéraux renvoyés par un handler (`{ accessToken,
 * actor }`) : sans DTO explicite, `POST /auth/admin/login`, `/auth/refresh` et `/auth/logout`
 * sortent SANS schéma de réponse dans l'OpenAPI, et le client TS généré côté fronts retombe en
 * `unknown` — impossible d'en tirer un access token typé. Même patron que
 * `src/shop/dto/catalog-response.dto.ts`.
 *
 * Aucun de ces DTO ne porte le REFRESH token : il vit exclusivement dans un cookie httpOnly
 * (D-016/D-016b), jamais dans un corps de réponse qu'un script pourrait lire.
 */
export class AuthenticatedActorDto {
  @ApiProperty({ description: "id de l'acteur (Member.id ou AdminUser.id)" })
  id!: number;

  @ApiProperty({
    enum: ActorType,
    description:
      'Cloisonnement strict MEMBER / ADMIN : un token MEMBER ne franchit jamais un guard ADMIN (D-016).',
  })
  actorType!: ActorType;

  @ApiPropertyOptional({
    enum: AdminRole,
    description: 'Présent uniquement pour un ADMIN (RBAC, D-017b).',
  })
  role?: AdminRole;
}

/**
 * Identité lisible de l'admin connecté, servie à chaque chargement du back-office. Distincte
 * de `AuthenticatedActorDto` (le contenu du token) : le nom et l'e-mail viennent de la base,
 * pas du JWT, qui peut avoir jusqu'à ~15 min de retard sur la réalité.
 */
export class AdminProfileResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'Amine Trabelsi' }) name!: string;
  @ApiProperty({ example: 'admin@najah.local' }) email!: string;
  @ApiProperty({ enum: AdminRole }) role!: AdminRole;
}

export class AdminLoginResponseDto {
  @ApiProperty({
    description:
      "Access token court (~15 min). À garder EN MÉMOIRE côté front, jamais en localStorage.",
  })
  accessToken!: string;

  @ApiProperty({ type: AuthenticatedActorDto })
  actor!: AuthenticatedActorDto;
}

export class AccessTokenResponseDto {
  @ApiProperty({ description: 'Nouvel access token issu du cookie refresh.' })
  accessToken!: string;
}

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}
