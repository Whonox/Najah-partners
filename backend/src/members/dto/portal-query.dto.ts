import { ApiPropertyOptional } from '@nestjs/swagger';
import { Leg, MemberStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Filtres de MA liste de downlines (spec §7.1.6). La portée — mon sous-arbre — vient du token,
 * jamais d'un paramètre : il n'existe aucun moyen, par cette route, de lire l'arbre d'autrui.
 */
export class DownlinesQueryDto {
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

  @ApiPropertyOptional({
    description: 'Recherche sur le code membre, le nom ou le prénom (insensible à la casse).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiPropertyOptional({
    enum: Leg,
    description: 'De quel côté DE MOI : filtre sur ma jambe gauche ou droite.',
  })
  @IsOptional()
  @IsEnum(Leg)
  leg?: Leg;

  @ApiPropertyOptional({
    description: 'Ne garder que mes filleuls directs (parrainage), quelle que soit leur position.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  directReferralsOnly?: boolean;
}
