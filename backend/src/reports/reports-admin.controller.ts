import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ReportPeriodQueryDto,
  TopAffiliatesQueryDto,
} from './dto/reports-query.dto';
import {
  ActivationsByPackRowDto,
  CirculationReportDto,
  CommissionsPeriodRowDto,
  SalesReportDto,
  TopAffiliateRowDto,
} from './dto/reports-response.dto';
import { ReportsService } from './reports.service';

/**
 * Rapports et analytics (spec §7.2.10). LECTURE pour les trois rôles — un rapport ne déplace rien.
 *
 * Pas de route d'export : le CSV est écrit par le front depuis le JSON qu'il affiche déjà. Une
 * route d'export aurait dupliqué chaque requête et chaque en-tête de colonne, avec la garantie
 * qu'un jour le fichier téléchargé ne dirait plus la même chose que le tableau à l'écran.
 */
@ApiTags('reports-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/reports')
export class ReportsAdminController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Ventes produits : unités, total DT et total POINTS par produit (snapshots figés), et répartition par contexte de commande.',
  })
  @ApiOkResponse({ type: SalesReportDto })
  sales(@Query() query: ReportPeriodQueryDto): Promise<SalesReportDto> {
    return this.reports.sales(query);
  }

  @Get('activations-by-pack')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Activations par pack : nombre, DINARS encaissés (prix − acompte, D-037) et POINTS injectés dans l’arbre (palier entier).',
  })
  @ApiOkResponse({ type: ActivationsByPackRowDto, isArray: true })
  activationsByPack(
    @Query() query: ReportPeriodQueryDto,
  ): Promise<ActivationsByPackRowDto[]> {
    return this.reports.activationsByPack(query);
  }

  @Get('commissions')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Commissions par période (une ligne par run hebdomadaire) : brut éligible, versé, PERDU au plafond, Points Fidélité accordés / perdus.',
  })
  @ApiOkResponse({ type: CommissionsPeriodRowDto, isArray: true })
  commissions(
    @Query() query: ReportPeriodQueryDto,
  ): Promise<CommissionsPeriodRowDto[]> {
    return this.reports.commissions(query);
  }

  @Get('circulation')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Dinars en circulation, décomposés : soldes des membres, e-cards actives, valeur consommée, valeur créée ex nihilo, commissions versées.',
  })
  @ApiOkResponse({ type: CirculationReportDto })
  circulation(): Promise<CirculationReportDto> {
    return this.reports.circulation();
  }

  @Get('top-affiliates')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Top affiliés par commissions réellement PERÇUES sur la période (plafond appliqué), avec équilibres à vie et Points Fidélité.',
  })
  @ApiOkResponse({ type: TopAffiliateRowDto, isArray: true })
  topAffiliates(
    @Query() query: TopAffiliatesQueryDto,
  ): Promise<TopAffiliateRowDto[]> {
    return this.reports.topAffiliates(query);
  }
}
