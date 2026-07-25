import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole, Prisma } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionsAdminService } from './commissions-admin.service';
import { CommissionRunService, RunResult } from './commission-run.service';
import {
  PendingEventsDto,
  RunDetailDto,
  RunMemberEventsDto,
  RunMemberPageDto,
  RunPageDto,
} from './dto/commissions-response.dto';
import {
  RelaunchRunDto,
  RunMembersQueryDto,
  RunsQueryDto,
} from './dto/runs-query.dto';
import { latestClosedPeriod, periodEndingAt } from './period';

/**
 * Moteur de commissions — SUPERVISION (spec §7.2.7). Le calcul est automatique (cron hebdo,
 * vendredi 23:59 Tunis) : cet écran regarde, il ne calcule pas.
 *
 * RBAC (esprit de D-017b) :
 *  - LECTURE ouverte aux trois rôles — un support qui doit expliquer un versement à un affilié
 *    a besoin de la chronologie, et lire n'a jamais déplacé un dinar ;
 *  - RELANCE réservée au **SUPER_ADMIN** : elle ne peut rien payer deux fois (la réclamation
 *    `runId IS NULL` est une barrière dure), mais elle crédite des soldes pour de vrai.
 *
 * PAS DE ROLLBACK, et ce n'est pas un oubli : annuler un run signifie reprendre des dinars déjà
 * crédités, donc possiblement déjà transformés en e-cards `USED` — irréversibles (D-025). Ce
 * que devient la valeur dans ce cas est une décision métier non tranchée (docs/decisions.md) ;
 * l'inventer ici, c'est écrire une règle du jeu dans un contrôleur.
 */
@ApiTags('commissions-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/commissions')
export class CommissionsAdminController {
  constructor(
    private readonly commissions: CommissionsAdminService,
    private readonly runs: CommissionRunService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('runs')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Historique des runs hebdomadaires (période, membres réglés, total distribué, statut).',
  })
  @ApiOkResponse({ type: RunPageDto })
  listRuns(@Query() query: RunsQueryDto): Promise<RunPageDto> {
    return this.commissions.listRuns(query);
  }

  @Get('pending')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Événements pas encore réclamés : ce que le prochain run réglera (dû BRUT, avant plafond).',
  })
  @ApiOkResponse({ type: PendingEventsDto })
  pending(): Promise<PendingEventsDto> {
    return this.commissions.pendingEvents();
  }

  @Get('runs/:runId')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Détail d’un run : totaux, argent PERDU au plafond, événements inéligibles, journal d’exécution.',
  })
  @ApiOkResponse({ type: RunDetailDto })
  runDetail(@Param('runId', ParseIntPipe) runId: number): Promise<RunDetailDto> {
    return this.commissions.runDetail(runId);
  }

  @Get('runs/:runId/members')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Décomposition par membre d’un run : brut, versé, perdu au plafond, plafond appliqué, Points Fidélité.',
  })
  @ApiOkResponse({ type: RunMemberPageDto })
  runMembers(
    @Param('runId', ParseIntPipe) runId: number,
    @Query() query: RunMembersQueryDto,
  ): Promise<RunMemberPageDto> {
    return this.commissions.runMembers(runId, query);
  }

  @Get('runs/:runId/members/:memberId/events')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Chronologie des événements d’un membre sur un run, dans l’ordre d’application du plafond (D-033).',
    description:
      'La part payée et la part perdue de CHAQUE événement ne sont pas stockées : elles sont ' +
      'rejouées par la fonction de règlement du moteur lui-même, sur les mêmes entrées. C’est ' +
      'l’explication exacte du versement, pas une reconstitution.',
  })
  @ApiOkResponse({ type: RunMemberEventsDto })
  memberEvents(
    @Param('runId', ParseIntPipe) runId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ): Promise<RunMemberEventsDto> {
    return this.commissions.memberEvents(runId, memberId);
  }

  /**
   * Relance de secours : rattraper une semaine que le cron aurait manquée (serveur arrêté).
   * Idempotente par construction — un run SUCCESS existant pour la période est un no-op, et la
   * réclamation empêche tout double crédit même si l'on forçait.
   *
   * Refus d'une période NON CLOSE : régler une semaine en cours paierait des événements que
   * d'autres activations viendront rejoindre, et le plafond de la semaine serait alors appliqué
   * deux fois sur deux moitiés — chacune sous le plafond, la somme au-dessus.
   */
  @Post('runs')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Relance de secours d’un run (SUPER_ADMIN). Idempotente : ne recrédite jamais une période déjà réglée.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        runId: { type: 'number' },
        status: { type: 'string' },
        memberCount: { type: 'number' },
        distributedDt: { type: 'string', example: '18750.000' },
        rewardPointsGranted: { type: 'number' },
        eventCount: { type: 'number' },
        alreadyExecuted: { type: 'boolean' },
        periodStart: { type: 'string', format: 'date-time' },
        periodEnd: { type: 'string', format: 'date-time' },
      },
    },
  })
  async relaunch(
    @Body() dto: RelaunchRunDto,
    @CurrentUser() admin: AuthenticatedActor,
  ): Promise<RunResult> {
    const now = new Date();
    const end = dto.periodEnd
      ? new Date(dto.periodEnd)
      : latestClosedPeriod(now).end;

    if (end.getTime() > now.getTime()) {
      throw new BadRequestException(
        'La période demandée n’est pas encore close : un run ne règle qu’une semaine terminée.',
      );
    }
    // Une clôture arbitraire découperait une « semaine » à cheval sur deux périodes du moteur,
    // et le plafond hebdomadaire s'appliquerait alors deux fois sur deux moitiés — chacune sous
    // le plafond, la somme au-dessus. La borne doit être une VRAIE clôture (D-009) : elle l'est
    // si la dernière clôture atteinte à cet instant est cet instant lui-même.
    if (latestClosedPeriod(end).end.getTime() !== end.getTime()) {
      throw new BadRequestException(
        'La clôture doit tomber un vendredi 23:59 (heure de Tunis) — voir D-009.',
      );
    }

    const period = periodEndingAt(end);
    const result = await this.runs.runForPeriod(period);
    await this.prisma.auditLog.create({
      data: {
        actor: String(admin.id),
        action: 'COMMISSION_RUN_RELAUNCH',
        target: `CommissionRun:${result.runId}`,
        before: Prisma.DbNull,
        after: {
          periodStart: period.start.toISOString(),
          periodEnd: period.end.toISOString(),
          status: result.status,
          memberCount: result.memberCount,
          distributedDt: result.distributedDt,
          alreadyExecuted: result.alreadyExecuted,
        },
      },
    });
    return result;
  }
}
