import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductType } from '@prisma/client';

/**
 * Miroir de doc pour le catalogue public : le plugin CLI `@nestjs/swagger`
 * n'introspecte pas les types générés par Prisma (`Category`, `Product`), donc sans ce
 * DTO explicite, `GET /shop/categories` et `GET /shop/products` sortent sans schéma de
 * réponse dans l'OpenAPI — et le client TS généré côté fronts retombe en `unknown`.
 */
export class CategoryResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() sortOrder!: number;
}

/**
 * Les montants DT (`priceDt`, `shippingFeeDt`, `promoPriceDt`) sont sérialisés en
 * STRING sur le fil (`Prisma.Decimal#toJSON`), jamais en `number` : c'est ainsi que la
 * précision au millime est préservée (voir `.claude/rules/ledger.md`).
 */
export class ProductResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() categoryId!: number;

  @ApiProperty({
    example: '45.000',
    description: 'DINARS — prix effectif hors promo, sérialisé en string.',
  })
  priceDt!: string;

  @ApiProperty({
    example: 250,
    description:
      'POINTS (BV) — compose le palier d’un pack, sans valeur monétaire.',
  })
  valueBv!: number;

  @ApiProperty({ enum: ProductType }) type!: ProductType;

  @ApiPropertyOptional({
    nullable: true,
    example: 100,
    description: 'null = illimité (VIRTUAL).',
  })
  stock!: number | null;

  @ApiProperty({
    example: '7.000',
    description: 'DINARS — affiché, réglé hors système, sérialisé en string.',
  })
  shippingFeeDt!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '39.900',
    description: 'DINARS — prix promo s’il existe, sérialisé en string.',
  })
  promoPriceDt!: string | null;

  @ApiProperty({ type: [String] }) images!: string[];
  @ApiProperty() active!: boolean;
  @ApiProperty() visibleOnSite!: boolean;
}
