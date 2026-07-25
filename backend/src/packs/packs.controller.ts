import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { PackOfferDto } from './dto/pack.dto';
import { PacksService } from './packs.service';

/**
 * Packs — surface AFFILIÉ (spec §7.1.4a).
 *
 * Sans elle, l'écran d'activation du portail serait impossible : le membre doit choisir un
 * pack, donc voir leurs paliers et leurs prix, et `GET /admin/packs` est réservé aux
 * administrateurs. C'est la seule raison d'être de cette route.
 *
 * DEUX DIFFÉRENCES AVEC LA ROUTE ADMIN, toutes deux délibérées :
 *  - seuls les packs ACTIFS sont rendus : proposer un pack désactivé serait proposer un achat
 *    que l'activation refuserait ensuite ;
 *  - le DTO ne porte pas le nombre de membres par pack. C'est un indicateur d'exploitation,
 *    utile à l'administration pour mesurer l'historique, sans objet pour un affilié — et une
 *    donnée sur les autres membres n'a pas à sortir sur la surface affilié, même agrégée.
 *
 * Route AUTHENTIFIÉE et non publique : la vitrine (Tranche 10) présentera l'offre commerciale
 * à sa façon ; ici, on sert un membre qui s'apprête à acheter.
 */
@ApiTags('portal')
@RequireActor(ActorType.MEMBER)
@Controller('packs')
export class PacksController {
  constructor(private readonly packs: PacksService) {}

  @Get()
  @ApiOperation({
    summary: 'Les packs proposés à l’activation (actifs seulement), par palier croissant.',
    description:
      'Le palier est en POINTS : c’est le total que le panier devra atteindre EXACTEMENT ' +
      '(D-006). Le prix est en DINARS, et le montant réellement dû à l’activation en est ' +
      'déduit de l’acompte d’inscription déjà versé (D-037). Les deux dimensions ne se ' +
      'convertissent jamais l’une dans l’autre (D-028).',
  })
  @ApiOkResponse({ type: PackOfferDto, isArray: true })
  list(): Promise<PackOfferDto[]> {
    return this.packs.listOffers();
  }
}
