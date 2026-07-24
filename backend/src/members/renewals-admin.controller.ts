import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RenewalService } from './renewal.service';

/**
 * Validation des renouvellements annuels (spec §5.9, D-010, D-038) — surface MINIMALE : la
 * file d'attente et son écran arrivent en Tranche 8.
 *
 * RBAC aligné sur les autres actions de gestion (D-017b) : SUPER_ADMIN et MANAGER valident,
 * SUPPORT consulte seulement. Valider n'est pas une création de valeur (les e-cards ont déjà
 * été brûlées par le membre) mais cela réactive un compte, donc rétablit un droit à percevoir
 * des commissions : ce n'est pas une action de support.
 */
@ApiTags('renewals-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/renewals')
export class RenewalsAdminController {
  constructor(private readonly renewals: RenewalService) {}

  @Get('pending')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Renouvellements payés en attente de validation (plus anciens d’abord).',
  })
  pending() {
    return this.renewals.listPending();
  }

  @Post(':paymentId/validate')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary: 'Valider un renouvellement : régularise le membre (D-038).',
    description:
      'Un membre INACTIF est RÉACTIVÉ (nouvelle baseline figée, carry-over d’avant le gel ' +
      'conservé — D-034) ; un membre encore ACTIF voit seulement son échéance repoussée. ' +
      'L’opération n’est pas rejouable : un renouvellement déjà validé est refusé.',
  })
  validate(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.renewals.validate({ paymentId, adminId: actor.id });
  }
}
