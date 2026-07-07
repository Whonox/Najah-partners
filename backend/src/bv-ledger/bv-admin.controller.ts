import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BvAdminService } from './bv-admin.service';
import { BvLedgerService } from './bv-ledger.service';
import { AdjustBvDto } from './dto/adjust-bv.dto';
import { GenesisBvDto } from './dto/genesis-bv.dto';
import { HistoryQueryDto } from './dto/history-query.dto';

/**
 * Endpoints admin du grand livre BV. Réservés aux ADMIN (guards globaux de la
 * Tranche 2 : @RequireActor + @Roles). Aucun endpoint ne laisse un membre
 * modifier son propre solde. Les écritures (ajustement, genèse) passent par le
 * moteur de solde et sont tracées dans AuditLog.
 */
@ApiTags('bv-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/bv')
export class BvAdminController {
  constructor(
    private readonly ledger: BvLedgerService,
    private readonly bvAdmin: BvAdminService,
  ) {}

  @Post('members/:memberId/adjustment')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({ summary: 'Ajustement manuel de BV (motif obligatoire, tracé)' })
  adjust(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: AdjustBvDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.bvAdmin.adjust({
      adminId: admin.id,
      memberId,
      amountBv: dto.amountBv,
      reason: dto.reason,
    });
  }

  @Post('members/:memberId/genesis')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Génération de BV (amorçage / promo, ADMIN_GENESIS)' })
  genesis(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: GenesisBvDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.bvAdmin.genesis({
      adminId: admin.id,
      memberId,
      amountBv: dto.amountBv,
      reason: dto.reason,
    });
  }

  @Get('members/:memberId/balance')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Solde BV courant d’un membre' })
  async balance(@Param('memberId', ParseIntPipe) memberId: number) {
    const bvBalance = await this.ledger.getBalance(memberId);
    return { memberId, bvBalance };
  }

  @Get('members/:memberId/history')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Historique paginé des mouvements BV d’un membre' })
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
