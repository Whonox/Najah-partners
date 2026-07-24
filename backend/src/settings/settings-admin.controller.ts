import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SettingResponseDto, UpdateSettingDto } from './dto/setting.dto';
import { SettingsService } from './settings.service';

/**
 * Paramètres système — surface admin (spec §7.2.11).
 *
 * RBAC dans l'esprit de D-017b (« l'action la plus sensible est la plus restreinte ») :
 * la LECTURE est ouverte aux 3 rôles, l'ÉCRITURE est réservée au **SUPER_ADMIN**. Ces clés
 * pilotent les frais d'inscription, le renouvellement annuel, l'expiration des e-cards et la
 * planification du run de commissions : changer une valeur revient à déplacer de la valeur,
 * même si aucun dinar ne bouge dans la requête.
 */
@ApiTags('settings-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Lister les paramètres système (clé, valeur, description)' })
  @ApiOkResponse({ type: SettingResponseDto, isArray: true })
  list() {
    return this.settings.list();
  }

  @Patch(':key')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Modifier la valeur d’un paramètre (SUPER_ADMIN, tracé dans AuditLog)',
  })
  @ApiOkResponse({ type: SettingResponseDto })
  update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.settings.update({ adminId: admin.id, key, value: dto.value });
  }
}
