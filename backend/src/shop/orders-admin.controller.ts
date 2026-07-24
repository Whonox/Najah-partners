import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  OrderPageResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';
import { AdminOrdersQueryDto, UpdateShipmentDto } from './dto/orders-query.dto';
import { OrdersService } from './orders.service';

/**
 * Commandes — surface admin (spec §7.2). Consultation ouverte aux 3 rôles ; l'avancement du
 * suivi d'expédition (logistique, aucun impact BV) est réservé à SUPER_ADMIN + MANAGER.
 * Aucune route ne touche à la valeur : elle a été réglée par e-card au checkout, et une
 * commande payée ne se modifie pas.
 */
@ApiTags('orders-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/orders')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Lister les commandes (filtres : membre, contexte, statut, étape d’expédition).',
  })
  @ApiOkResponse({ type: OrderPageResponseDto })
  list(@Query() query: AdminOrdersQueryDto) {
    return this.orders.listAll(query);
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary: 'Détail d’une commande (lignes + snapshots BV/DT).',
  })
  @ApiOkResponse({ type: OrderResponseDto })
  one(@Param('id', ParseIntPipe) id: number) {
    return this.orders.getOne(id);
  }

  @Patch(':id/shipment')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Avancer le suivi d’expédition : PREPARATION → SHIPPED → DELIVERED (produits physiques ; la livraison se règle hors système).',
  })
  @ApiOkResponse({ type: OrderResponseDto })
  shipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShipmentDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.orders.updateShipment(admin.id, id, dto.status);
  }
}
