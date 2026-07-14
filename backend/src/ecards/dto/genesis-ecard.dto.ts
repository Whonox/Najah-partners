import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class GenesisEcardDto {
  @ApiProperty({
    description:
      'Valeur en BV de l’e-card générée ex nihilo (amorçage du réseau / promotion). Aucun solde n’est débité.',
    example: 1000,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  valueBv!: number;

  @ApiPropertyOptional({
    description:
      'Durée de validité en jours ; -1 = illimité. Omis : le paramètre système ecard_expiration_days s’applique.',
    example: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(-1)
  expirationDays?: number;

  @ApiPropertyOptional({
    description: 'Motif (promo, amorçage…) — tracé dans l’AuditLog.',
    example: 'Promotion lancement — 10 e-cards Silver',
  })
  @IsOptional()
  reason?: string;
}
