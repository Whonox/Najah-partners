import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { money } from '../common/money';
import { ExtendEcardDto } from './dto/extend-ecard.dto';
import { GenesisEcardDto } from './dto/genesis-ecard.dto';
import { EcardsService } from './ecards.service';

/**
 * Surface admin des e-cards. RBAC aligné sur D-017b : l'action la plus sensible — CRÉER de
 * la valeur ex nihilo — est la plus restreinte.
 *
 *  - genèse   : SUPER_ADMIN seul (comme la genèse de BV : c'est la même création de valeur,
 *               sous une autre forme).
 *  - révocation / prolongation : SUPER_ADMIN + MANAGER — ces actions ne créent rien
 *               (la révocation rend au créateur ce qu'il a payé ; la prolongation ne fait
 *               que décaler une échéance).
 *
 * Toutes sont tracées dans l'AuditLog, et aucune ne fait apparaître le code en clair.
 */
@ApiTags('ecards-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/ecards')
export class EcardsAdminController {
  constructor(private readonly ecards: EcardsService) {}

  @Post('genesis')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Générer une e-card ex nihilo (amorçage / promo). Aucun solde débité ; expiration/révocation ne rembourse personne.',
  })
  genesis(
    @Body() dto: GenesisEcardDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.ecards.genesis({
      adminId: admin.id,
      valueDt: money(dto.valueDt),
      expirationDays: dto.expirationDays,
      reason: dto.reason,
    });
  }

  @Post(':id/revoke')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Révoquer une e-card ACTIVE : statut REVOKED, BV recrédité au créateur.',
  })
  revoke(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.ecards.revoke({
      ecardId: id,
      adminId: admin.id,
      reason: body?.reason,
    });
  }

  @Post(':id/extend')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Prolonger l’échéance de n’importe quelle e-card ACTIVE (support, D-026).',
  })
  extend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendEcardDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.ecards.extend({
      ecardId: id,
      days: dto.days,
      actorMemberId: null, // admin : aucun contrôle de propriété
      actorAdminId: admin.id,
    });
  }
}
