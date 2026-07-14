import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_TREE_DEPTH, MAX_TREE_DEPTH } from '../placement.service';

export class TreeQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_TREE_DEPTH,
    default: DEFAULT_TREE_DEPTH,
    description:
      'Nombre de niveaux de downlines à ramener. Borné : un sous-arbre binaire double à chaque niveau.',
  })
  @IsOptional()
  @Type(() => Number) // les paramètres d'URL arrivent en string
  @IsInt()
  @Min(1)
  @Max(MAX_TREE_DEPTH)
  depth?: number;
}
