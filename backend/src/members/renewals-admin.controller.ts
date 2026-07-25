import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  MembershipPaymentResponseDto,
  PendingRenewalDto,
} from './dto/renewal-response.dto';
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
      'File des renouvellements payés en attente de validation (plus anciens d’abord) : membre, état courant, échéance, montant figé, ids des e-cards brûlées.',
    description:
      'L’état courant du membre dit ce que la validation va faire : réactiver un INACTIF ' +
      '(nouvelle baseline, carry-over d’avant le gel conservé — D-034) ou seulement repousser ' +
      'l’échéance d’un ACTIF qui renouvelle par anticipation.',
  })
  @ApiOkResponse({ type: PendingRenewalDto, isArray: true })
  pending(): Promise<PendingRenewalDto[]> {
    return this.renewals.listPendingDetailed();
  }

  @Post(':paymentId/validate')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary: 'Valider un renouvellement : régularise le membre (D-038).',
    description:
      'Un membre INACTIF est RÉACTIVÉ (nouvelle baseline figée, carry-over d’avant le gel ' +
      'conservé — D-034) ; un membre encore ACTIF voit seulement son échéance repoussée. ' +
      'L’opération n’est pas rejouable : un renouvellement déjà validé est refusé. ' +
      'Il n’existe AUCUN chemin de refus (D-038, point ouvert) : les e-cards sont déjà brûlées ' +
      'et `USED` est irréversible — que devient la valeur ? À trancher avec la cliente.',
  })
  @ApiOkResponse({ type: MembershipPaymentResponseDto })
  validate(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.renewals.validate({ paymentId, adminId: actor.id });
  }
}
