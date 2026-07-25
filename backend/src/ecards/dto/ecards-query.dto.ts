import { ApiPropertyOptional } from '@nestjs/swagger';
import { EcardOrigin, EcardStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const SORT_FIELDS = ['createdAt', 'valueDt', 'expiresAt', 'usedAt'] as const;
const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type EcardSortField = (typeof SORT_FIELDS)[number];

export class AdminEcardsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /**
   * Recherche par CODE, en correspondance EXACTE (format `XXX-XXX-XXX-XXX`).
   *
   * Exacte, et non « contient » : une recherche partielle sur un code serait un oracle — en
   * tapant trois caractères, on saurait qu'une carte commençant ainsi existe, et on la
   * découvrirait par tâtonnement. Ici, il faut déjà connaître le code entier pour le retrouver,
   * ce qui n'apprend rien de neuf. Et la réponse ne le restitue jamais.
   */
  @ApiPropertyOptional({
    description:
      'Code d’e-card, en correspondance EXACTE. La réponse ne contient JAMAIS de code (voir EcardAdminRowDto).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @ApiPropertyOptional({ enum: EcardStatus })
  @IsOptional()
  @IsEnum(EcardStatus)
  status?: EcardStatus;

  @ApiPropertyOptional({ enum: EcardOrigin })
  @IsOptional()
  @IsEnum(EcardOrigin)
  origin?: EcardOrigin;

  @ApiPropertyOptional({ description: 'Cartes créées par ce membre.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creatorMemberId?: number;

  @ApiPropertyOptional({ description: 'Cartes consommées par ce membre.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userMemberId?: number;

  @ApiPropertyOptional({ description: 'Créées à partir de cette date (incluse), au format ISO.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Créées jusqu’à cette date (incluse), au format ISO.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sort?: EcardSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  direction?: 'asc' | 'desc';
}
