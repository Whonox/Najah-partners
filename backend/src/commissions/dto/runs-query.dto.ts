import { ApiPropertyOptional } from '@nestjs/swagger';
import { RunStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

class PageQueryDto {
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

export class RunsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: RunStatus })
  @IsOptional()
  @IsEnum(RunStatus)
  status?: RunStatus;

  @ApiPropertyOptional({
    description: 'Runs exécutés à partir de cette date (incluse), au format ISO.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Runs exécutés jusqu’à cette date (incluse), au format ISO.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class RunMembersQueryDto extends PageQueryDto {}

/** Pagination de MON historique de commissions (portail affilié). */
export class MyCommissionsQueryDto extends PageQueryDto {}

/**
 * Relance de secours (§7.2.7). On demande la CLÔTURE de la période, pas « la dernière semaine » :
 * un rattrapage vise une semaine précise, et la laisser deviner par le serveur ferait dépendre
 * le résultat de l'heure à laquelle l'admin a cliqué.
 *
 * L'opération reste idempotente côté service (barrière de réclamation `runId IS NULL`) : la
 * relancer ne recrédite jamais.
 */
export class RelaunchRunDto {
  @ApiPropertyOptional({
    description:
      'Clôture (fin EXCLUE) de la semaine à régler, au format ISO. Omise : la dernière semaine close.',
  })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}
