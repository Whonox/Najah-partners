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

  /**
   * NOMBRE de photos, jamais leurs chemins (D-059, durci en Tranche 9.5).
   *
   * `Product.images` contient des chemins de STOCKAGE relatifs (`product-images/AAAA-MM/
   * <uuid>.jpg`). Ils sortaient tels quels sur `GET /shop/products`, qui est PUBLIC : cela
   * publiait l'arborescence du répertoire d'uploads et la convention de nommage à qui voulait
   * les lire. Aucun client n'en a jamais eu besoin — les images se demandent par POSITION
   * (`/shop/products/:id/images/:index`), y compris côté administration, qui réordonne et
   * supprime par index elle aussi.
   *
   * Le compteur suffit donc à tout le monde, et il rend la faute IMPOSSIBLE plutôt
   * qu'improbable : un front ne peut pas concaténer dans une URL un chemin qu'il ne reçoit
   * pas. Les chemins restent internes au backend, seul endroit qui touche le disque.
   */
  @ApiProperty({ example: 3, description: 'Nombre de photos disponibles.' })
  imageCount!: number;

  @ApiProperty() active!: boolean;
  @ApiProperty() visibleOnSite!: boolean;
}

/**
 * Passe un produit de la base au fil : les chemins d'images deviennent leur nombre.
 *
 * On DÉSTRUCTURE plutôt que de recopier champ à champ : les montants DT sont des `Decimal`
 * Prisma, dont la sérialisation au millime tient à leur `toJSON`. Les reconstruire ici les
 * transformerait en nombres flottants sans que rien ne le signale — et la règle de couverture
 * exacte (D-030) se joue précisément au millime.
 */
export function toProductResponse<T extends { images: string[] }>(
  product: T,
): Omit<T, 'images'> & { imageCount: number } {
  const { images, ...rest } = product;
  return { ...rest, imageCount: images.length };
}
