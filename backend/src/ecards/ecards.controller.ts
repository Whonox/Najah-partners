import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireStepUp } from '../auth/decorators/require-step-up.decorator';
import { money } from '../common/money';
import { CreateEcardDto } from './dto/create-ecard.dto';
import {
  CreatedEcardResponseDto,
  EcardResponseDto,
  EcardVerificationResponseDto,
} from './dto/ecard-response.dto';
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
/**
 * SECONDE AUTHENTIFICATION (D-051/D-058) : tout ce contrôleur est derrière `@RequireStepUp()`.
 *
 * Une e-card EST de l'argent — la créer débite un solde, la prolonger repousse un
 * remboursement, la lister expose ce que le membre détient, la vérifier révèle la valeur d'un
 * code. Les quatre routes relèvent donc du même régime, et l'apposer au niveau de la CLASSE
 * évite le trou classique : une cinquième route ajoutée demain sans le décorateur.
 */
@ApiTags('ecards')
@RequireActor(ActorType.MEMBER)
@RequireStepUp()
@Controller('ecards')
export class EcardsController {
  constructor(private readonly ecards: EcardsService) {}

  @Post()
  @ApiOperation({
    summary:
      'Créer une e-card en DT (valeur ≤ solde disponible ; le solde est débité immédiatement).',
    description:
      'La réponse porte le CODE EN CLAIR — c’est la seule et unique fois (D-048). Aucune autre ' +
      'route ne le restituera jamais : le membre doit le conserver comme un billet.',
  })
  @ApiCreatedResponse({ type: CreatedEcardResponseDto })
  create(
    @Body() dto: CreateEcardDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.ecards.create({
      creatorId: actor.id,
      valueDt: money(dto.valueDt),
    });
  }

  @Get('mine')
  @ApiOperation({
    summary:
      'Mes e-cards : valeur, statut, dates de création / utilisation / expiration.',
    description:
      'SANS les codes (D-048) : une liste se recharge à volonté, un code ne se révèle qu’une fois.',
  })
  @ApiOkResponse({ type: EcardResponseDto, isArray: true })
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
  @ApiOkResponse({ type: EcardVerificationResponseDto })
  verify(@Body() dto: VerifyEcardDto) {
    return this.ecards.verify(dto.code);
  }

  @Post(':id/extend')
  @ApiOperation({
    summary:
      'Prolonger l’échéance d’une de MES e-cards ACTIVE (D-026 : le créateur en a le droit — prolonger ne crée aucune valeur, cela retarde son propre remboursement).',
  })
  @ApiCreatedResponse({ type: EcardResponseDto })
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
