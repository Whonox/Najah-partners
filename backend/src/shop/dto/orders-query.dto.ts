import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { OrderContext, OrderStatus, ShipmentStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class OrdersQueryDto {
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

/** Filtres réservés à l'admin (le membre ne voit que ses propres commandes). */
export class AdminOrdersQueryDto extends OrdersQueryDto {
  @ApiPropertyOptional({ enum: OrderContext })
  @IsOptional()
  @IsEnum(OrderContext)
  context?: OrderContext;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    enum: ShipmentStatus,
    description: 'File de préparation / expédition.',
  })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  shipmentStatus?: ShipmentStatus;

  @ApiPropertyOptional({ description: 'Commandes d’un membre donné.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId?: number;
}

export class UpdateShipmentDto {
  @ApiPropertyOptional({
    enum: ShipmentStatus,
    description:
      'Étape suivante : PREPARATION → SHIPPED → DELIVERED (jamais en arrière).',
  })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;
}

export class ProductsQueryDto {
  @ApiPropertyOptional({ description: 'Filtrer par catégorie.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;
}
