import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

/** Borne haute : prolonger de 10 ans n'est pas une prolongation, c'est un contournement du paramètre d'expiration. */
const MAX_EXTENSION_DAYS = 365;

export class ExtendEcardDto {
  @ApiProperty({
    description:
      'Nombre de jours dont l’échéance est repoussée (depuis l’échéance courante, ou depuis maintenant si elle est déjà passée).',
    example: 30,
    minimum: 1,
    maximum: MAX_EXTENSION_DAYS,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_EXTENSION_DAYS)
  days!: number;
}
