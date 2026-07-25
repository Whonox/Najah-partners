import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { money } from '../common/money';
import {
  EcardAdminActionDto,
  EcardAdminDetailDto,
  EcardAdminPageDto,
  GenesisEcardResponseDto,
} from './dto/ecard-admin-response.dto';
import { AdminEcardsQueryDto } from './dto/ecards-query.dto';
import { ExtendEcardDto } from './dto/extend-ecard.dto';
import { GenesisEcardDto } from './dto/genesis-ecard.dto';
import { RevokeEcardDto } from './dto/revoke-ecard.dto';
import { EcardsAdminService } from './ecards-admin.service';
import { EcardsService } from './ecards.service';
import type { EcardView } from './ecards.types';

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
 *
 * LECTURE (Tranche 8c) : ouverte aux trois rôles, et **sans jamais renvoyer un code** — le DTO
 * admin n'en porte pas (voir `EcardAdminRowDto`). Seule exception de toute l'API admin : la
 * réponse de la GENÈSE, qui rend le code UNE fois à celui qui vient de créer la carte. Sans
 * cela, la carte serait inutilisable — personne ne pourrait jamais la transmettre.
 */
@ApiTags('ecards-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/ecards')
export class EcardsAdminController {
  constructor(
    private readonly ecards: EcardsService,
    private readonly ecardsAdmin: EcardsAdminService,
  ) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Lister les e-cards (filtres statut / origine / créateur / bénéficiaire / période, recherche par code EXACT, tri, pagination).',
    description:
      'La réponse ne contient AUCUN code, y compris quand la recherche s’est faite par code : ' +
      'un code est de la valeur au porteur. Chercher n’est pas restituer.',
  })
  @ApiOkResponse({ type: EcardAdminPageDto })
  list(@Query() query: AdminEcardsQueryDto): Promise<EcardAdminPageDto> {
    return this.ecardsAdmin.list(query);
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Fiche d’une e-card : traçabilité création → utilisation, ce qu’elle a payé (commande ou adhésion), mouvements de solde liés.',
  })
  @ApiOkResponse({ type: EcardAdminDetailDto })
  one(@Param('id', ParseIntPipe) id: number): Promise<EcardAdminDetailDto> {
    return this.ecardsAdmin.getOne(id);
  }

  @Post('genesis')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Générer une e-card ex nihilo (amorçage / promo). Aucun solde débité ; expiration/révocation ne rembourse personne.',
    description:
      'SEULE réponse de l’API admin qui contient un code en clair, et une seule fois : une carte ' +
      'de genèse n’a pas de créateur à qui demander son code, et aucun autre canal ne permettrait ' +
      'de le transmettre. Il n’est ensuite plus jamais consultable.',
  })
  @ApiOkResponse({ type: GenesisEcardResponseDto })
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
      'Révoquer une e-card ACTIVE : statut REVOKED, valeur (DT) RECRÉDITÉE au créateur — sauf carte de genèse, qui n’a débité personne.',
  })
  @ApiOkResponse({ type: EcardAdminActionDto })
  async revoke(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevokeEcardDto,
    @CurrentUser() admin: AuthenticatedActor,
  ): Promise<EcardAdminActionDto> {
    return withoutCode(
      await this.ecards.revoke({
        ecardId: id,
        adminId: admin.id,
        reason: dto?.reason,
      }),
    );
  }

  @Post(':id/extend')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Prolonger l’échéance de n’importe quelle e-card ACTIVE (support, D-026). Borné à 365 jours.',
  })
  @ApiOkResponse({ type: EcardAdminActionDto })
  async extend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendEcardDto,
    @CurrentUser() admin: AuthenticatedActor,
  ): Promise<EcardAdminActionDto> {
    return withoutCode(
      await this.ecards.extend({
        ecardId: id,
        days: dto.days,
        actorMemberId: null, // admin : aucun contrôle de propriété
        actorAdminId: admin.id,
      }),
    );
  }
}

/**
 * Retire le `code` de la vue renvoyée par `EcardsService`.
 *
 * Les services de domaine rendent une `EcardView` qui PORTE le code — c'est légitime côté
 * portail (un membre a besoin du code de sa propre carte). Côté admin, le laisser passer aurait
 * suffi à le faire circuler dans la réponse HTTP d'une simple révocation. La destructuration
 * nommée le rend explicite : si `EcardView` gagne un jour un champ sensible, il faudra repasser
 * ici — et le compilateur y forcera, puisque le retour est typé sur le DTO sans code.
 */
function withoutCode(view: EcardView): EcardAdminActionDto {
  const { code: _code, ...rest } = view;
  return rest;
}
