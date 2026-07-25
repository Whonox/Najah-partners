import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { MONEY_SCALE } from '../../common/money';

export class GenesisBalanceDto {
  @ApiProperty({
    description:
      'Montant en DINARS à générer (amorçage réseau / promo), strictement positif. 3 décimales au maximum.',
    example: 2200,
    minimum: 0.001,
  })
  @IsNumber({ maxDecimalPlaces: MONEY_SCALE })
  @IsPositive()
  amountDt!: number;

  /**
   * OBLIGATOIRE depuis la Tranche 8c. La genèse est la seule opération de la plateforme qui
   * fabrique de la valeur ex nihilo (D-017b) : une ligne d'audit sans motif ne dit que « du
   * DT est apparu », ce qui est exactement l'information dont on n'a pas besoin. L'ajustement
   * l'exigeait déjà ; l'action la plus sensible ne pouvait pas être la moins tracée.
   */
  @ApiProperty({
    description: 'Motif OBLIGATOIRE (tracé dans le grand livre et l’audit).',
    example: 'Amorçage réseau — dotation initiale',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
