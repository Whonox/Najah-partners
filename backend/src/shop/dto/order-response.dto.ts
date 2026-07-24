import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderContext, OrderStatus, ShipmentStatus } from '@prisma/client';

/**
 * Miroirs de doc de `OrderView` / `OrderPage` (spec §7.2.6) : sans eux, les routes de
 * commandes sortent sans schéma et le client TS des fronts retombe en `unknown`.
 *
 * Une ligne de commande porte les DEUX dimensions, FIGÉES au checkout (D-028, §5.8) : des
 * POINTS entiers (`unitValueBv`) et des DINARS en chaîne (`unitPriceDt`). Revaloriser un
 * produit demain ne réécrit aucune commande passée — c'est tout l'objet de ces snapshots.
 */
export class OrderLineResponseDto {
  @ApiProperty() productId!: number;
  @ApiProperty({ description: 'Nom du produit, relu en direct (seul champ non figé).' })
  productName!: string;
  @ApiProperty() quantity!: number;

  @ApiProperty({
    example: 250,
    description: 'POINTS — valeur BV unitaire FIGÉE au checkout.',
  })
  unitValueBv!: number;

  @ApiProperty({
    example: '39.900',
    description: 'DINARS — prix unitaire EFFECTIF (promo comprise) FIGÉ au checkout.',
  })
  unitPriceDt!: string;
}

export class OrderResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() memberId!: number;

  @ApiProperty({
    enum: OrderContext,
    description:
      'ACTIVATION (le panier vaut exactement le palier en points) ou FREE (achat libre, sans effet sur l’arbre).',
  })
  context!: OrderContext;

  @ApiProperty({
    enum: OrderStatus,
    description: 'Une commande naît PAID : sans passerelle, le paiement est instantané (D-027).',
  })
  status!: OrderStatus;

  @ApiProperty({
    example: '2100.000',
    description:
      'DINARS payés : prix du pack MOINS l’acompte d’inscription (ACTIVATION — D-029 + D-037), ou Σ des prix effectifs (FREE). Jamais les frais de livraison.',
  })
  totalDt!: string;

  @ApiProperty({
    example: 1000,
    description: 'POINTS du panier — le palier, en ACTIVATION.',
  })
  totalPoints!: number;

  @ApiProperty({
    type: [Number],
    description:
      'Identifiants des e-cards qui ont réglé la commande (1..n — D-030/D-041). JAMAIS leurs codes : un code est de la valeur au porteur.',
  })
  ecardIds!: number[];

  @ApiPropertyOptional({ nullable: true }) shippingAddress!: string | null;

  @ApiPropertyOptional({
    enum: ShipmentStatus,
    nullable: true,
    description: 'null si la commande ne contient AUCUN produit PHYSICAL — rien à expédier.',
  })
  shipmentStatus!: ShipmentStatus | null;

  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ nullable: true }) paidAt!: Date | null;

  @ApiProperty({ type: [OrderLineResponseDto] })
  lines!: OrderLineResponseDto[];
}

export class OrderPageResponseDto {
  @ApiProperty({ type: [OrderResponseDto] }) items!: OrderResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
