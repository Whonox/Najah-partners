import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class GenesisBvDto {
  @ApiProperty({
    description: 'Montant BV à générer (amorçage réseau / promo), strictement positif.',
    example: 10000,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  amountBv!: number;

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
