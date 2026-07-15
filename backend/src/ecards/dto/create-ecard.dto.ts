import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';
import { MONEY_SCALE } from '../../common/money';

export class CreateEcardDto {
  @ApiProperty({
    description:
      'Valeur de l’e-card en DINARS — une e-card est de l’argent (D-028). Doit être couverte par le ' +
      'solde disponible du créateur (débité immédiatement). 3 décimales au maximum (le millime).',
    example: 2200,
    minimum: 0.001,
  })
  @IsNumber({ maxDecimalPlaces: MONEY_SCALE })
  @IsPositive()
  valueDt!: number;
}
