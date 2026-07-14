import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { OrdersService } from './orders.service';

/** Mes commandes (spec §7.1.4). Un membre ne voit jamais que les siennes. */
@ApiTags('orders')
@RequireActor(ActorType.MEMBER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Mes commandes (plus récentes d’abord).' })
  mine(
    @Query() query: OrdersQueryDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.orders.listMine(actor.id, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Détail d’une de MES commandes (lignes + snapshots).',
  })
  one(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.orders.getMine(actor.id, id);
  }
}
