import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { MONEY_SCALE } from '../../common/money';

export class GenesisEcardDto {
  @ApiProperty({
    description:
      'Valeur en DINARS de l’e-card générée ex nihilo (amorçage du réseau / promotion). Aucun solde ' +
      'n’est débité. 3 décimales au maximum (le millime).',
    example: 2200,
    minimum: 0.001,
  })
  @IsNumber({ maxDecimalPlaces: MONEY_SCALE })
  @IsPositive()
  valueDt!: number;

  @ApiPropertyOptional({
    description:
      'Durée de validité en jours ; -1 = illimité. Omis : le paramètre système ecard_expiration_days s’applique.',
    example: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(-1)
  expirationDays?: number;

  /**
   * OBLIGATOIRE depuis la Tranche 8c, comme pour la genèse de solde : c'est la seule opération
   * qui fabrique de la valeur ex nihilo (D-017b). « Du DT est apparu » sans dire pourquoi est
   * précisément la trace inutile.
   */
  @ApiProperty({
    description: 'Motif OBLIGATOIRE (promo, amorçage…) — tracé dans l’AuditLog.',
    example: 'Promotion lancement — e-card Silver',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
