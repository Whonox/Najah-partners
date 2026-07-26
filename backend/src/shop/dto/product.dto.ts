import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
 * Produit (spec §5.7). Deux dimensions de nature TOTALEMENT différente, sans conversion (D-028) :
 *  - `valueBv` : des POINTS. Ils composent le palier d'un pack à l'activation (D-006) et
 *    n'ont aucune valeur monétaire. Entier, strictement positif.
 *  - `priceDt`, `promoPriceDt` : des DINARS — ce que le produit COÛTE. En achat libre, c'est le
 *    prix effectif (promo comprise) qui fait le montant dû. Une promo baisse le prix sans jamais
 *    toucher aux points (D-002 révisée).
 *  - `shippingFeeDt` : affiché, réglé HORS système (espèces) — n'entre dans aucun montant dû.
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
    description:
      'Prix en DINARS — montant dû en achat libre (le prix promo prime s’il existe).',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  priceDt!: number;

  @ApiProperty({
    example: 250,
    description:
      'Valeur en POINTS (BV) — compose le palier d’un pack à l’activation. Sans valeur monétaire.',
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

  // ═══ `images` N'EST PLUS ACCEPTÉ ICI (D-054, D-059) ═══
  // Le champ existait depuis la Tranche 6 mais aucun écran ne l'alimentait : il acceptait
  // n'importe quelle CHAÎNE, donc n'importe quel chemin. Depuis qu'une route sert réellement
  // ces fichiers, laisser cette porte ouverte reviendrait à laisser un administrateur
  // désigner un chemin arbitraire à servir. Les photos se déposent désormais par
  // `POST /admin/shop/products/:id/images`, qui valide les OCTETS et pose lui-même le nom du
  // fichier — c'est le SEUL écrivain de cette colonne.

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

/**
 * Réordonnancement des photos d'un produit (D-059).
 *
 * Ne porte que des chemins DÉJÀ en base : le service refuse tout ce qui n'est pas une
 * permutation exacte de la liste existante. C'est ce contrôle — et non le type du champ —
 * qui empêche cette route de redevenir la porte par laquelle un chemin arbitraire s'écrit.
 */
export class ReorderProductImagesDto {
  @ApiProperty({
    type: [String],
    description:
      'Les chemins des images du produit, dans le nouvel ordre. La PREMIÈRE est celle que le ' +
      'portail met en avant. Doit être une permutation exacte de la liste actuelle.',
  })
  @IsArray()
  @IsString({ each: true })
  order!: string[];
}
