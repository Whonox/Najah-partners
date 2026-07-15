import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { MONEY_SCALE } from '../../common/money';

export class AdjustBalanceDto {
  @ApiProperty({
    description:
      'Montant signé en DINARS (+ crédit / − débit), non nul. 3 décimales au maximum (le millime).',
    example: -500,
  })
  @IsNumber({ maxDecimalPlaces: MONEY_SCALE })
  @NotEquals(0)
  amountDt!: number;

  @ApiProperty({
    description: 'Motif obligatoire (tracé dans le grand livre et l’audit).',
    example: 'Régularisation suite à une erreur de saisie',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
