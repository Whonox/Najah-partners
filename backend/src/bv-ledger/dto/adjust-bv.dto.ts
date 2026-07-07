import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, NotEquals } from 'class-validator';

export class AdjustBvDto {
  @ApiProperty({
    description: 'Montant signé en BV (+ crédit / − débit), non nul.',
    example: -500,
  })
  @IsInt()
  @NotEquals(0)
  amountBv!: number;

  @ApiProperty({
    description: 'Motif obligatoire (tracé dans le grand livre et l’audit).',
    example: 'Régularisation suite à une erreur de saisie',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
