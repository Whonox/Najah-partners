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

  @ApiPropertyOptional({
    description:
      'RECENTRER l’affichage sur ce membre au lieu de moi. Il doit appartenir à MON sous-arbre ' +
      '— sinon 403. C’est ce qui permet de descendre de proche en proche sans jamais charger ' +
      'l’arbre entier : chaque descente est une nouvelle requête BORNÉE, pas un dépliage qui ' +
      's’accumule. Omis : la racine est le membre connecté.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rootMemberId?: number;
}
