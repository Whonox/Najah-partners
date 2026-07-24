import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MemberStatus, VerificationStatus } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

/**
 * Colonnes de tri autorisées. Liste FERMÉE, et c'est délibéré : un tri se traduit en
 * `ORDER BY`, donc en nom de colonne. Accepter une chaîne libre reviendrait à laisser
 * l'appelant écrire dans la requête. Le tri par défaut est `id desc` (les derniers inscrits
 * d'abord), qui est aussi le seul tri TOTAL — les autres sont départagés par `id`, sinon deux
 * membres inscrits la même seconde pourraient apparaître deux fois ou pas du tout d'une page
 * à l'autre.
 */
export const MEMBER_SORT_FIELDS = [
  'id',
  'memberCode',
  'lastName',
  'status',
  'balanceDt',
  'registeredAt',
  'activatedAt',
] as const;

export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];

export class AdminMembersQueryDto {
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
    description:
      'Recherche sur le code membre, le nom, le prénom, l’e-mail ou le téléphone (insensible à la casse).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiPropertyOptional({ description: 'Filtrer sur le pack d’activation.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  packId?: number;

  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({
    description: 'Période d’inscription — borne basse, incluse (ISO 8601).',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsISO8601()
  registeredFrom?: string;

  @ApiPropertyOptional({
    description: 'Période d’inscription — borne haute, incluse (ISO 8601).',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsISO8601()
  registeredTo?: string;

  @ApiPropertyOptional({ enum: MEMBER_SORT_FIELDS, default: 'id' })
  @IsOptional()
  @IsIn(MEMBER_SORT_FIELDS)
  sort?: MemberSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  direction?: 'asc' | 'desc';
}
