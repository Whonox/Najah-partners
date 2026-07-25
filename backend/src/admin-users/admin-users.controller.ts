import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminUsersService } from './admin-users.service';
import {
  CreateAdminUserDto,
  ResetAdminPasswordDto,
  UpdateAdminUserDto,
} from './dto/admin-user-input.dto';
import {
  AdminSessionsDto,
  AdminUserDto,
} from './dto/admin-user-response.dto';

/**
 * Comptes administrateurs et rôles (spec §7.2.12) — **SUPER_ADMIN pour TOUT, lecture comprise**.
 *
 * Pourquoi la lecture aussi : la liste des comptes est une carte des privilèges (qui peut créer
 * de la valeur, qui peut ajuster un solde). C'est le seul module du back-office dont même la
 * consultation est restreinte, et c'est cohérent avec D-017b — l'action la plus sensible est la
 * plus fermée, et distribuer les droits l'est plus encore que les exercer.
 *
 * AUCUNE MATRICE DE PERMISSIONS n'est exposée. §7.2.12 parle de « permissions par module », mais
 * les rôles sont un enum et les droits vivent dans les guards : rendre cela éditable serait
 * refondre le modèle d'autorisation. Décision métier non tranchée → point ouvert consigné dans
 * `docs/decisions.md`, et rien d'inventé ici.
 */
@ApiTags('admin-users')
@RequireActor(ActorType.ADMIN)
@Roles(AdminRole.SUPER_ADMIN)
@Controller('admin/admin-users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lister les comptes administrateurs (rôle, activation, dernière connexion, sessions vivantes).',
  })
  @ApiOkResponse({ type: AdminUserDto, isArray: true })
  list(): Promise<AdminUserDto[]> {
    return this.adminUsers.list();
  }

  @Post()
  @ApiOperation({
    summary:
      'Créer un compte administrateur. Le mot de passe initial est transmis hors plateforme (aucun envoi d’e-mail — D-011).',
  })
  @ApiOkResponse({ type: AdminUserDto })
  create(
    @Body() dto: CreateAdminUserDto,
    @CurrentUser() admin: AuthenticatedActor,
  ): Promise<AdminUserDto> {
    return this.adminUsers.create(dto, admin.id);
  }

  @Patch(':adminUserId')
  @ApiOperation({
    summary: 'Modifier un compte : nom, rôle, activation. Tracé dans l’AuditLog.',
    description:
      'Refuse de vous désactiver ou de vous retirer votre propre rôle SUPER_ADMIN, et de retirer ' +
      'le DERNIER SUPER_ADMIN actif (la plateforme deviendrait inadministrable). Un changement de ' +
      'rôle ou une désactivation RÉVOQUE les sessions du compte : sans cela, le jeton déjà émis ' +
      'garderait les anciens droits jusqu’à son expiration.',
  })
  @ApiOkResponse({ type: AdminUserDto })
  update(
    @Param('adminUserId', ParseIntPipe) adminUserId: number,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() admin: AuthenticatedActor,
  ): Promise<AdminUserDto> {
    return this.adminUsers.update(adminUserId, dto, admin.id);
  }

  @Post(':adminUserId/password')
  @ApiOperation({
    summary:
      'Réinitialiser le mot de passe d’un administrateur (le SUPER_ADMIN le pose et le transmet hors plateforme). Révoque ses sessions.',
  })
  @ApiOkResponse({ type: AdminUserDto })
  resetPassword(
    @Param('adminUserId', ParseIntPipe) adminUserId: number,
    @Body() dto: ResetAdminPasswordDto,
    @CurrentUser() admin: AuthenticatedActor,
  ): Promise<AdminUserDto> {
    return this.adminUsers.resetPassword(adminUserId, dto, admin.id);
  }

  @Get(':adminUserId/sessions')
  @ApiOperation({
    summary:
      'Journal des SESSIONS d’un administrateur (ouverture, IP, navigateur, révocation), reconstitué depuis les jetons de rafraîchissement.',
    description:
      'Ce n’est pas un journal de connexion complet : les tentatives ÉCHOUÉES ne sont ' +
      'enregistrées nulle part en base (`failedAttemptsRecorded: false`). Les journaliser ' +
      'demanderait une table dédiée et une écriture dans le chemin d’authentification — point ' +
      'ouvert, pas une donnée inventée.',
  })
  @ApiOkResponse({ type: AdminSessionsDto })
  sessions(
    @Param('adminUserId', ParseIntPipe) adminUserId: number,
  ): Promise<AdminSessionsDto> {
    return this.adminUsers.sessions(adminUserId);
  }
}
