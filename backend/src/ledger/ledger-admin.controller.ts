import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { money, moneyToApi } from '../common/money';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { GenesisBalanceDto } from './dto/genesis-balance.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import {
  BalancePageDto,
  MovementPageDto,
} from './dto/ledger-registry.dto';
import {
  LedgerEntryResponseDto,
  LedgerHistoryPageDto,
  MemberBalanceResponseDto,
} from './dto/ledger-response.dto';
import { BalancesQueryDto, MovementsQueryDto } from './dto/registry-query.dto';
import { LedgerAdminService } from './ledger-admin.service';
import { LedgerRegistryService } from './ledger-registry.service';
import { LedgerService } from './ledger.service';

/**
 * Endpoints admin du grand livre (DINARS — D-028). Réservés aux ADMIN (guards globaux de la
 * Tranche 2 : @RequireActor + @Roles). Aucun endpoint ne laisse un membre modifier son propre
 * solde. Les écritures (ajustement, genèse) passent par le moteur de solde et sont tracées
 * dans AuditLog.
 *
 * Les montants entrent en `number` (JSON n'a que ça) et sont convertis en `Decimal` DÈS la
 * frontière : au-delà de ce fichier, aucun montant ne circule en flottant.
 */
@ApiTags('ledger-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/ledger')
export class LedgerAdminController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly ledgerAdmin: LedgerAdminService,
    private readonly registry: LedgerRegistryService,
  ) {}

  /**
   * Le REGISTRE (§7.2.8) : tous les soldes d'un coup, avec leur total. Les routes « par membre »
   * ci-dessous répondent à « et lui, combien ? » ; celle-ci répond à « où est l'argent ? ».
   */
  @Get('balances')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Registre des soldes par membre (recherche, filtre d’état, tri, pagination) + somme des soldes filtrés.',
  })
  @ApiOkResponse({ type: BalancePageDto })
  balances(@Query() query: BalancesQueryDto): Promise<BalancePageDto> {
    return this.registry.balances(query);
  }

  @Get('movements')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Journal GLOBAL des mouvements de solde (type, montant signé, solde après, source, date).',
  })
  @ApiOkResponse({ type: MovementPageDto })
  movements(@Query() query: MovementsQueryDto): Promise<MovementPageDto> {
    return this.registry.movements(query);
  }

  @Post('members/:memberId/adjustment')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary: 'Ajustement manuel du solde en DT (motif obligatoire, tracé)',
  })
  @ApiOkResponse({ type: LedgerEntryResponseDto })
  adjust(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: AdjustBalanceDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.ledgerAdmin.adjust({
      adminId: admin.id,
      memberId,
      amountDt: money(dto.amountDt),
      reason: dto.reason,
    });
  }

  @Post('members/:memberId/genesis')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Génération de solde en DT ex nihilo (amorçage / promo, ADMIN_GENESIS) — motif OBLIGATOIRE, tracé.',
  })
  @ApiOkResponse({ type: LedgerEntryResponseDto })
  genesis(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: GenesisBalanceDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.ledgerAdmin.genesis({
      adminId: admin.id,
      memberId,
      amountDt: money(dto.amountDt),
      reason: dto.reason,
    });
  }

  @Get('members/:memberId/balance')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Solde courant d’un membre (DT)' })
  @ApiOkResponse({ type: MemberBalanceResponseDto })
  async balance(@Param('memberId', ParseIntPipe) memberId: number) {
    const balance = await this.ledger.getBalance(memberId);
    return { memberId, balanceDt: moneyToApi(balance) };
  }

  @Get('members/:memberId/history')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary: 'Historique paginé des mouvements de solde d’un membre (DT)',
  })
  @ApiOkResponse({ type: LedgerHistoryPageDto })
  history(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query() query: HistoryQueryDto,
  ) {
    return this.ledger.getHistory(memberId, {
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
