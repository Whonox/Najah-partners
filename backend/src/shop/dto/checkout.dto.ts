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
import { MAX_ECARDS_PER_PAYMENT } from '../../ecards/ecards.service';

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
    type: [String],
    example: ['HHD-7Z7-JJD-77D', 'K4M-8P2-QRS-33T'],
    description:
      'Codes des e-cards réglant la commande. Leur SOMME doit égaler EXACTEMENT le montant ' +
      'dû en DT (D-007 révisé par D-030 : plusieurs cartes sont cumulables), ni appoint, ni ' +
      'trop-perçu.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ECARDS_PER_PAYMENT)
  @IsString({ each: true })
  @Matches(ECARD_CODE_PATTERN, { each: true, message: 'Code e-card invalide.' })
  ecardCodes!: string[];

  @ApiPropertyOptional({
    description:
      'Adresse de livraison (produits physiques). Les frais se règlent hors système.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shippingAddress?: string;
}

/**
 * Checkout d'ACTIVATION : le panier doit totaliser EXACTEMENT le palier du pack en POINTS
 * (D-006) ; le montant PAYÉ, lui, est le prix du pack moins l'acompte d'inscription (D-037).
 */
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
