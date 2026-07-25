import { ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerMovementType, MemberStatus } from '@prisma/client';
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

const SORT_DIRECTIONS = ['asc', 'desc'] as const;
const BALANCE_SORT_FIELDS = ['memberCode', 'lastName', 'balanceDt'] as const;

export type BalanceSortField = (typeof BALANCE_SORT_FIELDS)[number];

class PagedQueryDto {
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
}

export class BalancesQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ description: 'Recherche sur le code membre, le nom ou le prénom.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiPropertyOptional({
    description: 'N’afficher que les membres dont le solde est strictement positif.',
  })
  @IsOptional()
  @Type(() => Boolean)
  withBalanceOnly?: boolean;

  @ApiPropertyOptional({ enum: BALANCE_SORT_FIELDS, default: 'balanceDt' })
  @IsOptional()
  @IsIn(BALANCE_SORT_FIELDS)
  sort?: BalanceSortField;

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  direction?: 'asc' | 'desc';
}

export class MovementsQueryDto extends PagedQueryDto {
  @ApiPropertyOptional({ description: 'Recherche sur le code membre, le nom ou le prénom.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ description: 'Restreindre à un membre.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId?: number;

  @ApiPropertyOptional({ enum: LedgerMovementType })
  @IsOptional()
  @IsEnum(LedgerMovementType)
  type?: LedgerMovementType;

  @ApiPropertyOptional({ description: 'Mouvements à partir de cette date (incluse), au format ISO.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Mouvements jusqu’à cette date (incluse), au format ISO.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
