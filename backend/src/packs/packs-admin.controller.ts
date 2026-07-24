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
import { CreatePackDto, PackResponseDto, UpdatePackDto } from './dto/pack.dto';
import { PacksService } from './packs.service';

/**
 * Packs — surface admin (spec §7.2.4).
 *
 * RBAC (D-043) : LECTURE ouverte aux trois rôles, ÉCRITURE réservée au **SUPER_ADMIN** —
 * alignée sur les paramètres système (D-042), et non sur le catalogue.
 * La nuance vient de ce qu'un pack CONTIENT : un produit porte un prix et une valeur BV, mais
 * n'émet aucune commission ; un pack fixe la commission directe, la commission indirecte par
 * équilibre et le plafond hebdomadaire. Le modifier, c'est définir combien la plateforme
 * versera — l'action la plus sensible reste la plus restreinte (esprit de D-017b).
 *
 * AUCUNE ROUTE DE SUPPRESSION, jamais : l'historique des activations dépend des packs
 * (`Member.packId`, `Member.activationSnapshot`). On désactive (`active = false`).
 */
@ApiTags('packs-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/packs')
export class PacksAdminController {
  constructor(private readonly packs: PacksService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary: 'Lister les packs (actifs ET inactifs), par palier croissant.',
  })
  @ApiOkResponse({ type: PackResponseDto, isArray: true })
  list(): Promise<PackResponseDto[]> {
    return this.packs.list();
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Détail d’un pack.' })
  @ApiOkResponse({ type: PackResponseDto })
  one(@Param('id', ParseIntPipe) id: number): Promise<PackResponseDto> {
    return this.packs.getOne(id);
  }

  @Post()
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Créer un pack (palier en POINTS ; prix, commissions et plafond en DINARS — plafond ≥ commissions).',
  })
  @ApiOkResponse({ type: PackResponseDto })
  create(
    @Body() dto: CreatePackDto,
    @CurrentUser() admin: AuthenticatedActor,
  ): Promise<PackResponseDto> {
    return this.packs.create(admin.id, dto);
  }

  @Patch(':id')
  @Roles(AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Modifier un pack — n’affecte QUE les activations futures (snapshot, §5.8). Désactiver = retirer de la vente, jamais supprimer.',
  })
  @ApiOkResponse({ type: PackResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePackDto,
    @CurrentUser() admin: AuthenticatedActor,
  ): Promise<PackResponseDto> {
    return this.packs.update(admin.id, id, dto);
  }
}
