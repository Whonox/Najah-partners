import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductType } from '@prisma/client';

/**
 * Produit (spec §5.7). Deux montants de nature TOTALEMENT différente :
 *  - `valueBv`  : la seule valeur transactionnelle (D-002). Entier, strictement positif.
 *  - `priceDt`, `promoPriceDt`, `shippingFeeDt` : de l'AFFICHAGE. La plateforme n'encaisse
 *    rien en dinars ; une promo baisse le prix affiché sans jamais toucher au BV.
 */
export class CreateProductDto {
  @ApiProperty({ example: 'Huile d’olive extra-vierge 1 L' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  categoryId!: number;

  @ApiProperty({
    example: 45.0,
    description: 'Prix de référence en DT — AFFICHAGE seul (D-002).',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  priceDt!: number;

  @ApiProperty({
    example: 250,
    description: 'Valeur BV — la seule valeur transactionnelle.',
  })
  @IsInt()
  @Min(1)
  valueBv!: number;

  @ApiProperty({ enum: ProductType })
  @IsEnum(ProductType)
  type!: ProductType;

  @ApiPropertyOptional({
    example: 100,
    description:
      'Stock — obligatoire si PHYSICAL, doit être absent si VIRTUAL (illimité).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    example: 7.0,
    description:
      'Frais de livraison en DT — AFFICHÉS puis réglés hors système, jamais dans le montant BV dû.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  shippingFeeDt?: number;

  @ApiPropertyOptional({
    example: 39.9,
    description:
      'Prix promotionnel en DT (≤ prix de référence). La valeur BV reste inchangée.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  promoPriceDt?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  images?: string[];

  @ApiPropertyOptional({ default: true, description: 'Achetable.' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Visible sur la vitrine publique.',
  })
  @IsOptional()
  @IsBoolean()
  visibleOnSite?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
