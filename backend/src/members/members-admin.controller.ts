import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TreeQueryDto } from './dto/tree-query.dto';
import { MembersFacade } from './members.facade';

/**
 * Généalogie du réseau côté back-office (spec §7.2.3). Consultation seule : les trois rôles
 * y ont accès, comme pour la lecture des soldes (D-017b). Aucune route d'activation ni de
 * modification de placement n'existe (D-023, placement immuable).
 */
@ApiTags('members-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/members')
export class MembersAdminController {
  constructor(private readonly facade: MembersFacade) {}

  @Get(':memberId/tree')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Sous-arbre binaire d’un membre (généalogie).' })
  tree(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query() query: TreeQueryDto,
  ) {
    return this.facade.tree(memberId, query.depth);
  }
}
