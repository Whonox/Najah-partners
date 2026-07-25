import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberDetailDto, MemberPageDto } from './dto/member-response.dto';
import { AdminMembersQueryDto } from './dto/members-query.dto';
import { TreeQueryDto } from './dto/tree-query.dto';
import { TreeNodeDto } from './dto/tree-response.dto';
import {
  VerificationResultDto,
  VerifyIdentityDto,
} from './dto/verify-identity.dto';
import { IdentityDocumentService } from './identity-document.service';
import { IdentityVerificationService } from './identity-verification.service';
import { MembersAdminService } from './members-admin.service';
import { MembersFacade } from './members.facade';

/**
 * Membres et généalogie du réseau côté back-office (spec §7.2.2 et §7.2.3).
 *
 * **CONSULTATION pour les trois rôles**, et UNE seule écriture : le verdict de vérification
 * d'identité (D-018/D-039, Tranche 8c), qui ne touche que des colonnes documentaires et ne
 * change RIEN au fonctionnement du membre. Tout le reste est en lecture, et ce n'est pas un
 * oubli :
 *  - le PLACEMENT est immuable (D-023) : il n'existe aucune façon légitime de le modifier ;
 *  - l'ACTIVATION passe par le checkout (elle injecte des points et écrit des événements de
 *    commission dans une transaction verrouillée — D-027, D-035), jamais par un bouton
 *    d'administration ;
 *  - l'AJUSTEMENT de solde vit dans le grand livre (`/admin/ledger/…`, motif obligatoire et
 *    tracé), pas dans la fiche membre ;
 *  - « bloquer / débloquer » (§7.2.2) N'EXISTE PAS en base et n'est volontairement pas inventé
 *    ici : `MemberStatus.INACTIVE` est le GEL de non-renouvellement (D-034), le détourner
 *    falsifierait le moteur de commissions. Décision métier en attente (docs/plan.md).
 */
@ApiTags('members-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/members')
export class MembersAdminController {
  constructor(
    private readonly facade: MembersFacade,
    private readonly membersAdmin: MembersAdminService,
    private readonly documents: IdentityDocumentService,
    private readonly verification: IdentityVerificationService,
  ) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Lister les membres (recherche, filtres pack / statut / vérification / période, tri, pagination).',
  })
  @ApiOkResponse({ type: MemberPageDto })
  list(@Query() query: AdminMembersQueryDto): Promise<MemberPageDto> {
    return this.membersAdmin.list(query);
  }

  @Get(':memberId')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Fiche membre : identité, position (sponsor ET upline de placement), points par jambe, carry-over, solde, compteurs du moteur.',
  })
  @ApiOkResponse({ type: MemberDetailDto })
  one(
    @Param('memberId', ParseIntPipe) memberId: number,
  ): Promise<MemberDetailDto> {
    return this.membersAdmin.getOne(memberId);
  }

  /**
   * L'image de la pièce d'identité (D-018, D-039). Servie par l'application et NON en fichier
   * statique : elle est nominative, et un répertoire d'uploads exposé par le reverse-proxy
   * serait lisible par quiconque devine une URL. Ici, chaque octet exige un jeton ADMIN valide.
   *
   * `no-store` : une pièce d'identité n'a rien à faire dans le cache d'un navigateur partagé.
   */
  @Get(':memberId/id-document')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Image de la pièce d’identité déposée à l’inscription (à comparer au numéro saisi — D-039).',
  })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Header('Cache-Control', 'no-store')
  async idDocument(
    @Param('memberId', ParseIntPipe) memberId: number,
  ): Promise<StreamableFile> {
    const relativePath = await this.membersAdmin.getIdDocumentPath(memberId);
    const document = relativePath
      ? await this.documents.read(relativePath)
      : null;
    if (!document) {
      throw new NotFoundException(
        `Aucune pièce d'identité lisible pour le membre ${memberId}.`,
      );
    }
    return new StreamableFile(document.buffer, { type: document.mime });
  }

  /**
   * Le verdict de vérification (§7.2.12 des tâches admin ; D-018, D-039). SUPER_ADMIN + MANAGER :
   * apposer un badge d'identité n'est pas du support, mais ce n'est pas non plus une création de
   * valeur — d'où le même couple de rôles que la validation d'un renouvellement.
   *
   * NON BLOQUANT (D-018) : cette route ne change ni l'état d'adhésion, ni les points, ni le
   * solde, ni l'éligibilité aux commissions. Un membre REJECTED s'active et perçoit normalement.
   */
  @Post(':memberId/verification')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Statuer sur la vérification d’identité : VERIFIED ou REJECTED (motif obligatoire au rejet). Tracé dans l’AuditLog.',
    description:
      'N’a AUCUN effet bloquant (D-018) : le badge informe, il n’interdit ni l’activation, ni la ' +
      'perception de commissions, ni le renouvellement.',
  })
  @ApiOkResponse({ type: VerificationResultDto })
  verify(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: VerifyIdentityDto,
    @CurrentUser() admin: AuthenticatedActor,
  ): Promise<VerificationResultDto> {
    return this.verification.decide({
      memberId,
      adminId: admin.id,
      status: dto.status,
      reason: dto.reason,
    });
  }

  @Get(':memberId/tree')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary:
      'Sous-arbre binaire d’un membre (généalogie), BORNÉ en profondeur — l’arbre entier n’est jamais chargé.',
  })
  @ApiOkResponse({ type: TreeNodeDto })
  tree(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query() query: TreeQueryDto,
  ) {
    return this.facade.tree(memberId, query.depth);
  }
}
