import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { memoryStorage } from 'multer';
import type { AuthenticatedActor } from '../../auth/auth.types';
import { RequireActor } from '../../auth/decorators/actor-type.decorator';
import { AllowIncompleteOnboarding } from '../../auth/decorators/allow-incomplete-onboarding.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { InvalidIdDocumentError } from '../members.errors';
import { MAX_ID_DOCUMENT_BYTES } from '../identity-document.service';
import {
  OnboardingStatusDto,
  SecurityQuestionsCatalogDto,
} from './dto/onboarding-response.dto';
import { SetPinDto, SetSecurityQuestionsDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';
import {
  REQUIRED_SECURITY_ANSWERS,
  SECURITY_QUESTION_KEYS,
} from './security-questions';

/**
 * Parcours de première connexion (D-050, D-057).
 *
 * ═══ TOUT CE CONTRÔLEUR EST `@AllowIncompleteOnboarding()` ═══
 * C'est la seule exemption au blocage, et elle est nécessaire : sans elle, le membre serait
 * enfermé dehors — il lui faudrait avoir terminé le parcours pour pouvoir le commencer.
 *
 * ═══ CE QUE CE PARCOURS N'EST PAS ═══
 * Ce n'est pas une validation d'identité. Déposer l'image suffit à entrer ; le verdict de
 * l'admin arrive plus tard et ne bloque RIEN (D-018). Le membre achète, s'active et perçoit
 * avec un dossier `PENDING`, et le portail le lui dit par un badge, pas par une porte fermée.
 */
@ApiTags('portal')
@RequireActor(ActorType.MEMBER)
@AllowIncompleteOnboarding()
@Controller('members/me/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @ApiOperation({
    summary:
      'Où en est ma première connexion : les trois étapes et leur état (D-050).',
    description:
      'Lu à l’ouverture du parcours pour savoir où le reprendre. Rappelle le TYPE et le ' +
      'NUMÉRO de pièce saisis à l’inscription (D-039) — l’image, elle, se dépose ici (D-050).',
  })
  @ApiOkResponse({ type: OnboardingStatusDto })
  status(@CurrentUser() actor: AuthenticatedActor) {
    return this.onboarding.status(actor.id);
  }

  @Get('security-questions')
  @ApiOperation({
    summary:
      'Catalogue des questions secrètes : les CLÉS, jamais les libellés.',
    description:
      'Les libellés français vivent dans l’interface (D-015/D-057) : les faire voyager par ' +
      'l’API disperserait les textes utilisateur entre deux dépôts et lierait la traduction ' +
      'AR/RTL à un redéploiement du backend.',
  })
  @ApiOkResponse({ type: SecurityQuestionsCatalogDto })
  catalog(): SecurityQuestionsCatalogDto {
    return {
      keys: [...SECURITY_QUESTION_KEYS],
      required: REQUIRED_SECURITY_ANSWERS,
    };
  }

  @Post('id-document')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['idDocument'],
      properties: {
        idDocument: {
          type: 'string',
          format: 'binary',
          description: 'Image de la pièce (JPEG, PNG, WebP ou PDF, 5 Mo max).',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Étape 1 — déposer l’image de ma pièce d’identité (D-050).',
    description:
      'Le TYPE et le NUMÉRO ont été saisis à l’inscription ; seule l’image se dépose ici ' +
      '(D-060 : elle a quitté le formulaire public, qui est anonyme et n’a pas à recevoir ' +
      'de binaire de 5 Mo d’un inconnu). Le format est reconnu par les OCTETS du fichier, ' +
      'jamais par le `Content-Type` annoncé par le client.',
  })
  @ApiOkResponse({ type: OnboardingStatusDto })
  @UseInterceptors(
    FileInterceptor('idDocument', {
      storage: memoryStorage(), // le fichier n'atteint le disque qu'une fois validé
      limits: { fileSize: MAX_ID_DOCUMENT_BYTES, files: 1 },
    }),
  )
  uploadIdDocument(
    @CurrentUser() actor: AuthenticatedActor,
    @UploadedFile() idDocument?: Express.Multer.File,
  ) {
    if (!idDocument) {
      throw new InvalidIdDocumentError('aucun fichier reçu.');
    }
    return this.onboarding.uploadIdDocument(actor.id, idDocument);
  }

  @Post('security-questions')
  @ApiOperation({
    summary: 'Étape 2 — enregistrer mes trois questions secrètes (D-050).',
    description:
      'Trois questions DIFFÉRENTES. Les réponses sont normalisées (accents dépliés, espaces ' +
      'réduits, minuscules) puis hachées : la vérification est insensible à la casse et aux ' +
      'espaces, et la valeur saisie n’est stockée nulle part. Ces réponses sont le SEUL ' +
      'recours pour réinitialiser un PIN oublié — aucun canal e-mail ni SMS n’existe (D-011).',
  })
  @ApiOkResponse({ type: OnboardingStatusDto })
  setSecurityQuestions(
    @CurrentUser() actor: AuthenticatedActor,
    @Body() dto: SetSecurityQuestionsDto,
  ) {
    return this.onboarding.setSecurityQuestions(actor.id, dto.answers);
  }

  @Post('pin')
  @ApiOperation({
    summary: 'Étape 3 — créer mon code PIN (D-050).',
    description:
      'Le PIN et les questions secrètes sont les DEUX voies, équivalentes, de la seconde ' +
      'authentification (D-051). Une fois le parcours terminé, cette route se ferme : ' +
      'changer son PIN passe par le profil, derrière une seconde authentification.',
  })
  @ApiOkResponse({ type: OnboardingStatusDto })
  setPin(@CurrentUser() actor: AuthenticatedActor, @Body() dto: SetPinDto) {
    return this.onboarding.setPin(actor.id, dto.pin);
  }
}
