import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Fenêtre d'observation commune aux rapports. Les deux bornes sont OPTIONNELLES : sans elles, le
 * rapport porte sur toute l'histoire — c'est la lecture qu'on attend d'un « total à ce jour », et
 * imposer une période forcerait à en inventer une par défaut.
 */
export class ReportPeriodQueryDto {
  @ApiPropertyOptional({ description: 'Début INCLUS, au format ISO.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fin INCLUSE, au format ISO.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class TopAffiliatesQueryDto extends ReportPeriodQueryDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
