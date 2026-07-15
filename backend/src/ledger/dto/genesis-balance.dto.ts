import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
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

  @ApiProperty({
    required: false,
    description: 'Motif optionnel (tracé dans l’audit).',
    example: 'Amorçage réseau — dotation initiale',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
