import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateEcardDto } from './dto/create-ecard.dto';
import { ExtendEcardDto } from './dto/extend-ecard.dto';
import { VerifyEcardDto } from './dto/verify-ecard.dto';
import { EcardsService } from './ecards.service';

/**
 * Surface affilié des e-cards (spec §7.1.3). Réservée aux membres authentifiés.
 *
 * Un code e-card EST de la valeur au porteur : la vérification est donc strictement
 * limitée en débit. Sans quota, l'endpoint offrirait un oracle pour énumérer l'espace des
 * codes et découvrir les e-cards actives des autres membres.
 */
@ApiTags('ecards')
@RequireActor(ActorType.MEMBER)
@Controller('ecards')
export class EcardsController {
  constructor(private readonly ecards: EcardsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Créer une e-card (valeur ≤ solde disponible ; le solde est débité immédiatement).',
  })
  create(
    @Body() dto: CreateEcardDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.ecards.create({ creatorId: actor.id, valueBv: dto.valueBv });
  }

  @Get('mine')
  @ApiOperation({
    summary:
      'Mes e-cards : valeur, statut, dates de création / utilisation / expiration.',
  })
  mine(@CurrentUser() actor: AuthenticatedActor) {
    return this.ecards.listCreatedBy(actor.id);
  }

  @Post('verify')
  // Anti-brute-force : 20 essais / minute. Un code fait 12 caractères sur un alphabet de 32
  // (~10^18 combinaisons) — à ce débit, l'énumération est hors de portée.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Vérifier un code : validité et valeur, SANS le consommer.',
  })
  verify(@Body() dto: VerifyEcardDto) {
    return this.ecards.verify(dto.code);
  }

  @Post(':id/extend')
  @ApiOperation({
    summary:
      'Prolonger l’échéance d’une de MES e-cards ACTIVE (D-026 : le créateur en a le droit — prolonger ne crée aucune valeur, cela retarde son propre remboursement).',
  })
  extend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendEcardDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.ecards.extend({
      ecardId: id,
      days: dto.days,
      actorMemberId: actor.id, // la propriété est vérifiée dans le service
      actorAdminId: null,
    });
  }
}
