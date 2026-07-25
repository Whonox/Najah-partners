import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    default: 30,
    minimum: 7,
    maximum: 180,
    description:
      'Profondeur des séries quotidiennes (croissance du réseau, activations par jour), en jours.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(180)
  days?: number;
}
