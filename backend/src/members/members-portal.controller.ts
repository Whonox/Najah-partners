import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuccessResponseDto } from '../auth/dto/auth-response.dto';
import { HistoryQueryDto } from '../ledger/dto/history-query.dto';
import { LedgerHistoryPageDto } from '../ledger/dto/ledger-response.dto';
import { LedgerService } from '../ledger/ledger.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DownlinesQueryDto } from './dto/portal-query.dto';
import {
  DownlinePageDto,
  MemberDashboardDto,
  MemberProfileDto,
} from './dto/portal-response.dto';
import { UpdateMemberProfileDto } from './dto/update-profile.dto';
import { MembersPortalService } from './members-portal.service';

/**
 * MON espace (spec §7.1). Toutes les routes sont sous `/members/me` et sont réservées aux
 * MEMBRES authentifiés.
 *
 * ═══ « me » N'EST PAS UNE CONVENTION D'ÉCRITURE, C'EST LA GARANTIE ═══
 * Aucune de ces routes ne porte d'identifiant de membre — ni en segment d'URL, ni en query, ni
 * en corps. La portée vient EXCLUSIVEMENT du token. Il n'existe donc pas de requête, même
 * forgée à la main, par laquelle un affilié lirait ou modifierait le compte d'un autre : il n'y
 * a aucun paramètre à altérer. C'est structurel, pas déclaratif — et c'est pour cela qu'aucune
 * variante `/members/:id/...` n'est ouverte ici, même en lecture.
 */
@ApiTags('portal')
@RequireActor(ActorType.MEMBER)
@Controller('members/me')
export class MembersPortalController {
  constructor(
    private readonly portal: MembersPortalService,
    private readonly ledger: LedgerService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Mon profil (spec §7.1.7) : identité, position, pack figé, vérification, renouvellement.',
    description:
      'Le pack rendu est le SNAPSHOT d’activation, jamais le pack vivant : c’est lui que le ' +
      'moteur applique. Sponsor (parrainage → commission directe) et upline de placement ' +
      '(position → binaire) sont deux champs distincts, et c’est délibéré : les confondre est ' +
      'la méprise la plus fréquente du modèle.',
  })
  @ApiOkResponse({ type: MemberProfileDto })
  profile(@CurrentUser() actor: AuthenticatedActor): Promise<MemberProfileDto> {
    return this.portal.profile(actor.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Modifier mon profil — nom et prénom UNIQUEMENT.',
    description:
      'L’e-mail et le téléphone sont des IDENTIFIANTS DE CONNEXION et sont absents du corps ' +
      'accepté (D-049) : aucun canal de confirmation n’existe (D-011), une saisie erronée ' +
      'coûterait l’accès au compte sans « mot de passe oublié » pour la rattraper. Leur ' +
      'correction passe par l’administration.',
  })
  @ApiOkResponse({ type: MemberProfileDto })
  updateProfile(
    @CurrentUser() actor: AuthenticatedActor,
    @Body() dto: UpdateMemberProfileDto,
  ): Promise<MemberProfileDto> {
    return this.portal.updateProfile(actor.id, dto);
  }

  @Post('password')
  @ApiOperation({
    summary: 'Changer mon mot de passe (mot de passe actuel exigé).',
    description:
      'TOUTES mes sessions sont révoquées : un jeton de rafraîchissement déjà émis — y compris ' +
      'celui d’un intrus — survivrait sinon au changement. Le portail doit donc redemander une ' +
      'connexion juste après.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  changePassword(
    @CurrentUser() actor: AuthenticatedActor,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    return this.portal.changePassword(actor.id, dto);
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Mon tableau de bord (spec §7.1.1) : solde, jambes, carry-over, gains, réseau, e-cards.',
    description:
      'Aucun calcul de règle : chaque chiffre est lu tel qu’une activation, un run ou un ' +
      'paiement l’a écrit. Rappel des DEUX débordements, qu’il ne faut jamais confondre — les ' +
      'POINTS non appariés restent en réserve sans échéance, l’ARGENT au-delà du plafond ' +
      'hebdomadaire est PERDU (D-033).',
  })
  @ApiOkResponse({ type: MemberDashboardDto })
  dashboard(
    @CurrentUser() actor: AuthenticatedActor,
  ): Promise<MemberDashboardDto> {
    return this.portal.dashboard(actor.id);
  }

  @Get('downlines')
  @ApiOperation({
    summary: 'Mes downlines (spec §7.1.6) : position, état, points apportés — paginé et filtrable.',
    description:
      'Ne porte NI e-mail, NI téléphone, NI solde : voir le sous-arbre de quelqu’un ne donne ' +
      'aucun droit sur ses coordonnées ni sur son argent. `rootLeg` dit de quel côté DE MOI il ' +
      'se trouve ; `leg` est sa position locale sous son propre upline.',
  })
  @ApiOkResponse({ type: DownlinePageDto })
  downlines(
    @CurrentUser() actor: AuthenticatedActor,
    @Query() query: DownlinesQueryDto,
  ): Promise<DownlinePageDto> {
    return this.portal.downlines(actor.id, query);
  }

  @Get('ledger')
  @ApiOperation({
    summary: 'Mes mouvements de solde (DINARS), paginés.',
    description:
      'RAPPEL D-025 : consommer une e-card n’écrit RIEN ici — aucun solde ne bouge quand une ' +
      'carte paie. Seules la création d’une e-card (débit) et son remboursement (recrédit) ' +
      'apparaissent, avec les commissions et les ajustements.',
  })
  @ApiOkResponse({ type: LedgerHistoryPageDto })
  // Même service et même forme de réponse que la route admin équivalente : les montants
  // traversent en chaîne (`Prisma.Decimal#toJSON`), jamais en flottant. Pas de retour typé
  // explicite ici, pour la même raison que côté admin — le service rend l'entité Prisma, dont
  // les `Decimal` se sérialisent en chaîne au passage du JSON.
  ledgerHistory(
    @CurrentUser() actor: AuthenticatedActor,
    @Query() query: HistoryQueryDto,
  ) {
    return this.ledger.getHistory(actor.id, {
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}
