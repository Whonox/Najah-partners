import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CreateEcardDto {
  @ApiProperty({
    description:
      'Valeur de l’e-card en BV. Doit être couverte par le solde disponible du créateur (le solde est débité immédiatement).',
    example: 1000,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  valueBv!: number;
}
