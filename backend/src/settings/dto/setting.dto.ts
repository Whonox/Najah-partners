import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Miroir de doc du modèle Prisma `Setting` : le plugin CLI `@nestjs/swagger` n'introspecte pas
 * les types générés par Prisma, donc sans ce DTO `GET /admin/settings` sortirait sans schéma et
 * le client TS des fronts retomberait en `unknown` (patron `ProductResponseDto`).
 *
 * `value` est TOUJOURS une chaîne, quelle que soit la clé : c'est le consommateur qui sait
 * l'interpréter (`registration_fee_dt` en Decimal, `ecard_expiration_days` en entier,
 * `commission_timezone` en fuseau…) et qui refuse une valeur invalide à la lecture. Le back-office
 * n'interprète rien.
 */
export class SettingResponseDto {
  @ApiProperty({ example: 'registration_fee_dt' })
  key!: string;

  @ApiProperty({
    example: '100',
    description: 'Valeur brute, toujours en chaîne — jamais interprétée ici.',
  })
  value!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;
}

export class UpdateSettingDto {
  @ApiProperty({
    example: '120',
    description: 'Nouvelle valeur brute. Aucune interprétation par clé côté API.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  value!: string;
}
