import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireStepUp } from '../auth/decorators/require-step-up.decorator';
import { CheckoutService } from './checkout.service';
import { ActivationCheckoutDto, FreeCheckoutDto } from './dto/checkout.dto';
import { OrderResponseDto } from './dto/order-response.dto';

/**
 * Checkout (spec §7.1.4). Réservé aux membres authentifiés.
 *
 * Débit limité : chaque appel porte des CODES D'E-CARD, c'est-à-dire de la valeur au porteur.
 * Sans quota, le checkout offrirait le même oracle d'énumération que la vérification d'e-card
 * — en pire, puisqu'un code deviné y serait directement CONSOMMÉ. Depuis le cumul (D-030), un
 * appel porte jusqu'à `MAX_ECARDS_PER_PAYMENT` codes : le quota borne les requêtes, le plafond
 * borne les essais par requête. L'endpoint reste authentifié — un tâtonnement y est nominatif.
 */
@ApiTags('checkout')
@RequireActor(ActorType.MEMBER)
// SECONDE AUTHENTIFICATION (D-051) : payer est l'opération la plus lourde de conséquences du
// portail — elle brûle des e-cards irréversiblement (D-025) et, en activation, fixe pour la
// vie le pack et le snapshot de commission du membre. C'est exactement ce qu'une session
// laissée ouverte ne doit jamais permettre à quelqu'un d'autre de déclencher.
@RequireStepUp()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('shop/checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('activation')
  @ApiOperation({
    summary:
      'Activer son compte : panier totalisant EXACTEMENT le palier du pack en POINTS (D-006), réglé par une ou plusieurs e-cards dont la SOMME vaut le prix du pack MOINS l’acompte d’inscription (D-030, D-037). Commande, e-cards, activation, arbre et stock committent ensemble ou pas du tout.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  activation(
    @Body() dto: ActivationCheckoutDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.checkout.activationCheckout({
      memberId: actor.id,
      packId: dto.packId,
      items: dto.items,
      ecardCodes: dto.ecardCodes,
      shippingAddress: dto.shippingAddress,
    });
  }

  @Post('free')
  @ApiOperation({
    summary:
      'Achat libre (membre ACTIF) : e-cards dont la SOMME égale exactement le total des prix DT du panier. Aucun effet sur l’arbre, aucun solde crédité (D-005, D-025).',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  free(@Body() dto: FreeCheckoutDto, @CurrentUser() actor: AuthenticatedActor) {
    return this.checkout.freeCheckout({
      memberId: actor.id,
      items: dto.items,
      ecardCodes: dto.ecardCodes,
      shippingAddress: dto.shippingAddress,
    });
  }
}
