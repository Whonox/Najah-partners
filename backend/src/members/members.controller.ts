import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import { memoryStorage } from 'multer';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PayRenewalDto } from './dto/pay-renewal.dto';
import { RegisterMemberDto } from './dto/register-member.dto';
import { TreeQueryDto } from './dto/tree-query.dto';
import { MAX_ID_DOCUMENT_BYTES } from './identity-document.service';
import { MembersFacade } from './members.facade';
import { RenewalService } from './renewal.service';

/**
 * Surface publique et affilié.
 *
 * L'INSCRIPTION EST LE POINT LE PLUS EXPOSÉ DE L'API : publique, anonyme (D-021) et, depuis
 * D-036, consommatrice de VALEUR — elle brûle les e-cards des frais d'inscription. C'est donc
 * un oracle potentiel sur l'espace des codes, et elle est traitée comme telle :
 *
 *  - quota strict par IP, sur DEUX fenêtres (2/min, 5/h). Il compte les REQUÊTES, pas les
 *    succès : un paiement refusé consomme du quota, sinon tâtonner serait gratuit ;
 *  - le nombre d'e-cards par requête est plafonné (`MAX_ECARDS_PER_PAYMENT`) — sans cela une
 *    seule requête vaudrait autant d'essais qu'elle porte de codes, et le quota ne
 *    protégerait plus rien. Plafond × quota = 50 essais/h/IP contre ~1,15 × 10^18 codes ;
 *  - le refus de paiement est VOLONTAIREMENT indistinct (voir `RegistrationPaymentRefusedError`) :
 *    aucune réponse ne dit si un code existe, s'il est déjà utilisé, ni ce qu'il vaut. Il
 *    n'existe d'ailleurs aucun endpoint public de vérification d'e-card — `POST /ecards/verify`
 *    est réservé aux membres authentifiés, et le rester est délibéré.
 *
 * Le quota reste par IP : derrière un reverse-proxy, `TRUST_PROXY` doit être renseigné, sinon
 * toutes les requêtes semblent venir du proxy et se partagent un seul seau (voir `main.ts`).
 * Une attaque distribuée resterait hors de portée de ce mécanisme — la réponse serait un OTP
 * à l'inscription, ce qui réviserait D-011/D-021.
 *
 * Chaque inscription consomme par ailleurs une position DÉFINITIVE dans l'arbre (D-013 : ni
 * expiration, ni libération) et un code membre : le débit doit rester faible pour cette raison
 * aussi.
 */
@ApiTags('members')
@Controller('members')
export class MembersController {
  constructor(
    private readonly facade: MembersFacade,
    private readonly renewals: RenewalService,
  ) {}

  @Post('register')
  @Public()
  @Throttle({
    default: { limit: 2, ttl: 60_000 }, // rafale
    hourly: { limit: 5, ttl: 3_600_000 }, // acharnement patient
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: RegisterMemberDto })
  @ApiOperation({
    summary:
      'Inscription : frais réglés par e-card(s), membre INSCRIT, code attribué, place définitive.',
    description:
      'Les e-cards fournies doivent totaliser EXACTEMENT les frais d’inscription (100 DT, ' +
      'paramétrable) ; elles sont brûlées dans la même transaction que la création du membre ' +
      '(D-036). Ce montant vaut ACOMPTE : il sera déduit du prix du pack à l’activation ' +
      '(D-037). Aucun point n’est injecté dans l’arbre à ce stade (D-005).',
  })
  @UseInterceptors(
    FileInterceptor('idDocument', {
      storage: memoryStorage(), // le fichier n'atteint le disque qu'une fois validé
      limits: { fileSize: MAX_ID_DOCUMENT_BYTES, files: 1 },
    }),
  )
  register(
    @Body() dto: RegisterMemberDto,
    @UploadedFile() idDocument?: Express.Multer.File,
  ) {
    return this.facade.register(dto, idDocument);
  }

  @Get('me/tree')
  @RequireActor(ActorType.MEMBER)
  @ApiOperation({ summary: 'Sous-arbre binaire du membre connecté (spec §7.1.5).' })
  tree(@CurrentUser() actor: AuthenticatedActor, @Query() query: TreeQueryDto) {
    return this.facade.tree(actor.id, query.depth);
  }

  @Post('me/renewal')
  @RequireActor(ActorType.MEMBER)
  @ApiOperation({
    summary: 'Régler le renouvellement annuel par e-card(s) (spec §5.9).',
    description:
      'Le total des e-cards doit valoir exactement le montant annuel. Le paiement NE ' +
      'RÉACTIVE PAS : il crée une demande en attente de validation par l’administration ' +
      '(D-038). Un membre gelé le reste, et ne perçoit toujours rien, jusqu’à cette validation.',
  })
  payRenewal(
    @CurrentUser() actor: AuthenticatedActor,
    @Body() dto: PayRenewalDto,
  ) {
    return this.renewals.pay({
      memberId: actor.id,
      ecardCodes: dto.ecardCodes,
    });
  }

  @Get('me/renewals')
  @RequireActor(ActorType.MEMBER)
  @ApiOperation({
    summary: 'Mes renouvellements annuels : montant, date, état de la validation.',
  })
  myRenewals(@CurrentUser() actor: AuthenticatedActor) {
    return this.renewals.listForMember(actor.id);
  }
}
