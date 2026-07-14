import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CheckoutService } from './checkout.service';
import { ActivationCheckoutDto, FreeCheckoutDto } from './dto/checkout.dto';

/**
 * Checkout (spec §7.1.4). Réservé aux membres authentifiés.
 *
 * Débit limité : chaque appel porte un CODE D'E-CARD, c'est-à-dire de la valeur au porteur.
 * Sans quota, le checkout offrirait le même oracle d'énumération que la vérification d'e-card
 * — en pire, puisqu'un code deviné y serait directement CONSOMMÉ.
 */
@ApiTags('checkout')
@RequireActor(ActorType.MEMBER)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('shop/checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('activation')
  @ApiOperation({
    summary:
      'Activer son compte : panier totalisant EXACTEMENT le palier du pack, réglé par une e-card de valeur égale (D-006, D-007). Commande, e-card, activation, arbre et stock committent ensemble ou pas du tout.',
  })
  activation(
    @Body() dto: ActivationCheckoutDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.checkout.activationCheckout({
      memberId: actor.id,
      packId: dto.packId,
      items: dto.items,
      ecardCode: dto.ecardCode,
      shippingAddress: dto.shippingAddress,
    });
  }

  @Post('free')
  @ApiOperation({
    summary:
      'Achat libre (membre ACTIF) : e-card de valeur égale à la somme des BV du panier. Aucun effet sur l’arbre, aucun BV crédité (D-005, D-025).',
  })
  free(@Body() dto: FreeCheckoutDto, @CurrentUser() actor: AuthenticatedActor) {
    return this.checkout.freeCheckout({
      memberId: actor.id,
      items: dto.items,
      ecardCode: dto.ecardCode,
      shippingAddress: dto.shippingAddress,
    });
  }
}
