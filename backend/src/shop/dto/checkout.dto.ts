import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ECARD_CODE_PATTERN } from '../../ecards/ecard-code';

export class CartItemDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiProperty({ example: 2, minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}

class CheckoutDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @ApiProperty({
    example: 'HHD-7Z7-JJD-77D',
    description:
      'Code de l’e-card. Sa valeur doit égaler EXACTEMENT le montant BV dû (D-007) : une seule e-card, ni appoint, ni trop-perçu.',
  })
  @IsString()
  @Matches(ECARD_CODE_PATTERN, { message: 'Code e-card invalide.' })
  ecardCode!: string;

  @ApiPropertyOptional({
    description:
      'Adresse de livraison (produits physiques). Les frais se règlent hors système.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string;
}

/** Checkout d'ACTIVATION : le panier doit totaliser EXACTEMENT le palier du pack (D-006). */
export class ActivationCheckoutDto extends CheckoutDto {
  @ApiProperty({
    example: 1,
    description: 'Pack à activer (le panier doit valoir son palier).',
  })
  @IsInt()
  @Min(1)
  packId!: number;
}

/** Achat LIBRE : aucun effet sur l'arbre, aucun BV crédité (D-005). */
export class FreeCheckoutDto extends CheckoutDto {}
