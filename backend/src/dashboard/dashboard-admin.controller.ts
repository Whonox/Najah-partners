import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardDto } from './dto/dashboard-response.dto';

/**
 * Tableau de bord du back-office (spec §7.2.1) — la page d'atterrissage après connexion.
 *
 * LECTURE SEULE pour les TROIS rôles : un tableau de bord ne fait rien, il montre. Les actions
 * qu'il met en avant (traiter une vérification, valider un renouvellement) restent gardées par
 * leur module d'origine, avec leur propre RBAC.
 */
@ApiTags('dashboard-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/dashboard')
export class DashboardAdminController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Agrégats du tableau de bord : membres, activations, packs, e-cards, dinars en circulation, dernier / prochain run, tâches en attente, séries quotidiennes.',
  })
  @ApiOkResponse({ type: DashboardDto })
  overview(@Query() query: DashboardQueryDto): Promise<DashboardDto> {
    return this.dashboard.overview(query.days);
  }
}
