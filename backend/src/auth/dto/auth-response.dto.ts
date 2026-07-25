import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActorType, AdminRole, MemberStatus } from '@prisma/client';

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

/**
 * Identité minimale du membre, rendue à la connexion pour que le portail affiche un nom
 * avant même son premier appel de données.
 *
 * DÉLIBÉRÉMENT MAIGRE : la réponse rendait jusqu'ici la ligne `Member` entière (solde,
 * snapshot d'activation, compteurs du moteur, statut de vérification…). Un écran de connexion
 * n'a besoin de rien de tout cela, et une réponse de login est le pire endroit où faire
 * circuler l'état financier d'un compte — elle traverse les journaux et les caches avant même
 * qu'une session existe. Le portail lit le reste par `GET /members/me`, sous token.
 */
export class MemberSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'NP000042' }) memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({
    enum: MemberStatus,
    description: 'REGISTERED (inscrit non activé) · ACTIVE · INACTIVE (gelé, D-034).',
  })
  status!: MemberStatus;
}

export class MemberLoginResponseDto {
  @ApiProperty({
    description:
      "Access token court (~15 min). À garder EN MÉMOIRE côté portail, jamais en localStorage.",
  })
  accessToken!: string;

  @ApiProperty({ type: MemberSummaryDto })
  member!: MemberSummaryDto;
}

export class AccessTokenResponseDto {
  @ApiProperty({ description: 'Nouvel access token issu du cookie refresh.' })
  accessToken!: string;
}

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}
