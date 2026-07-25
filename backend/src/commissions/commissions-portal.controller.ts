import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CommissionsPortalService } from './commissions-portal.service';
import { MyCommissionPageDto } from './dto/commissions-portal.dto';
import { RunMemberEventsDto } from './dto/commissions-response.dto';
import { MyCommissionsQueryDto } from './dto/runs-query.dto';

/**
 * MES commissions (spec §7.1). Réservé aux membres authentifiés.
 *
 * Aucune route ne porte d'identifiant de membre : la portée vient du token. Le seul paramètre
 * accepté est un numéro de RUN — changer ce numéro donne accès à MES semaines, jamais à celles
 * d'un autre.
 */
@ApiTags('portal')
@RequireActor(ActorType.MEMBER)
@Controller('commissions')
export class CommissionsPortalController {
  constructor(private readonly portal: CommissionsPortalService) {}

  @Get('mine')
  @ApiOperation({
    summary:
      'Mes commissions, semaine par semaine : brut, versé, PERDU au plafond, ventilation par nature, Points Fidélité.',
    description:
      'Les deux « débordements » du modèle ne se confondent pas : les POINTS non appariés ' +
      'restent en réserve, SANS ÉCHÉANCE ; l’ARGENT au-delà du plafond hebdomadaire est PERDU ' +
      'et jamais reporté (D-033). C’est `lostDt` qui porte le second.',
  })
  @ApiOkResponse({ type: MyCommissionPageDto })
  myRuns(
    @CurrentUser() actor: AuthenticatedActor,
    @Query() query: MyCommissionsQueryDto,
  ): Promise<MyCommissionPageDto> {
    return this.portal.myRuns(actor.id, query);
  }

  @Get('mine/:runId')
  @ApiOperation({
    summary: 'Pourquoi ce montant : la chronologie de MES événements sur une semaine.',
    description:
      'Ordre STRICT `(occurredAt, id)` — l’ordre même d’application du plafond (D-033 : sur une ' +
      'même activation, la commission DIRECTE précède les ÉQUILIBRES). La ventilation est ' +
      'rejouée par `settleWeek`, la fonction qu’a exécutée le run : c’est l’explication exacte ' +
      'du versement, pas une reconstitution. Même source que la supervision admin (D-047).',
  })
  @ApiOkResponse({ type: RunMemberEventsDto })
  myRunEvents(
    @CurrentUser() actor: AuthenticatedActor,
    @Param('runId', ParseIntPipe) runId: number,
  ): Promise<RunMemberEventsDto> {
    return this.portal.myRunEvents(actor.id, runId);
  }
}
