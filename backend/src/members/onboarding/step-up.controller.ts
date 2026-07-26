import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import type { AuthenticatedActor } from '../../auth/auth.types';
import { RequireActor } from '../../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SuccessResponseDto } from '../../auth/dto/auth-response.dto';
import {
  MySecurityQuestionsDto,
  ResetPinDto,
  StepUpChallengeDto,
  StepUpTokenDto,
  VerifyStepUpDto,
} from './dto/step-up.dto';
import { StepUpService } from './step-up.service';

/**
 * Seconde authentification (D-051, D-058).
 *
 * ═══ CE CONTRÔLEUR N'EST PAS DERRIÈRE `@RequireStepUp()` ═══
 * Évidemment : c'est lui qui la délivre. Il est en revanche derrière l'authentification et
 * derrière le parcours d'accueil — on ne peut pas prouver son identité par un PIN qu'on n'a
 * pas encore créé.
 *
 * ═══ QUOTA PROPRE, PLUS SERRÉ QUE LE QUOTA GLOBAL ═══
 * Le compteur d'essais (5, puis blocage) est par MEMBRE. Le quota ci-dessous est par IP et
 * couvre autre chose : quelqu'un qui balaierait plusieurs comptes depuis une même machine ne
 * déclencherait aucun blocage individuel — cinq essais sur cent comptes, c'est cinq cents
 * essais et zéro compte bloqué. Les deux mécanismes sont nécessaires, et aucun ne remplace
 * l'autre.
 */
@ApiTags('portal')
@RequireActor(ActorType.MEMBER)
@Controller('members/me/step-up')
export class StepUpController {
  constructor(private readonly stepUp: StepUpService) {}

  @Post('challenge')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Tirer au hasard UNE de mes trois questions secrètes (D-051).',
    description:
      'Le tirage est fait par le SERVEUR, avec un générateur cryptographique, et lié au jeton ' +
      'rendu : un tirage prédictible — ou un défi non lié — laisserait choisir la question ' +
      'dont on connaît la réponse plutôt que de subir celle qui tombe. Demander un défi ne ' +
      'consomme AUCUN essai : seule une vérification qui échoue compte.',
  })
  @ApiCreatedResponse({ type: StepUpChallengeDto })
  challenge(@CurrentUser() actor: AuthenticatedActor) {
    return this.stepUp.challenge(actor.id);
  }

  @Post('verify')
  @Throttle({
    default: { limit: 10, ttl: 60_000 },
    hourly: { limit: 60, ttl: 3_600_000 },
  })
  @ApiOperation({
    summary:
      'Prouver mon identité par mon PIN OU par une question secrète (D-051).',
    description:
      'Les deux voies sont ÉQUIVALENTES et partagent UN SEUL compteur d’essais : épuiser ' +
      'l’une n’ouvre pas l’autre (D-058). Le refus est volontairement INDISTINCT — même code, ' +
      'même message pour un PIN faux, une réponse fausse, un défi expiré ou un compte bloqué. ' +
      'Rend un jeton à présenter en en-tête `X-Step-Up`.',
  })
  @ApiCreatedResponse({ type: StepUpTokenDto })
  verify(
    @CurrentUser() actor: AuthenticatedActor,
    @Body() dto: VerifyStepUpDto,
  ) {
    // La cohérence du corps est vérifiée ici et non par un décorateur conditionnel : un champ
    // manquant est une erreur d'APPELANT, pas une tentative ratée — elle ne doit donc ni
    // consommer un essai, ni recevoir le refus indistinct, qui ferait croire à un mauvais
    // secret là où il s'agit d'une requête mal formée.
    if (dto.method === 'PIN') {
      if (!dto.pin) {
        throw new BadRequestException('`pin` est requis pour la méthode PIN.');
      }
      return this.stepUp.verify(actor.id, { method: 'PIN', pin: dto.pin });
    }

    if (!dto.challengeToken || dto.answer === undefined) {
      throw new BadRequestException(
        '`challengeToken` et `answer` sont requis pour la méthode QUESTION.',
      );
    }
    return this.stepUp.verify(actor.id, {
      method: 'QUESTION',
      challengeToken: dto.challengeToken,
      answer: dto.answer,
    });
  }

  @Get('questions')
  @ApiOperation({
    summary: 'Les clés de MES trois questions secrètes (sans les réponses).',
    description:
      'Nécessaire à l’écran de réinitialisation du PIN : sans elle, il faudrait faire deviner ' +
      'lesquelles des dix questions du catalogue sont les siennes, chaque essai raté débitant ' +
      'une tentative sur le compteur commun. Ce n’est pas une fuite : ces questions sont celles ' +
      'que le membre a lui-même choisies, et la protection du step-up tient au TIRAGE côté ' +
      'serveur, pas au secret de la liste.',
  })
  @ApiOkResponse({ type: MySecurityQuestionsDto })
  myQuestions(@CurrentUser() actor: AuthenticatedActor) {
    return this.stepUp.myQuestionKeys(actor.id);
  }

  @Post('pin/reset')
  @Throttle({
    default: { limit: 5, ttl: 60_000 },
    hourly: { limit: 20, ttl: 3_600_000 },
  })
  @ApiOperation({
    summary: 'Réinitialiser un PIN oublié avec mes questions secrètes (D-058).',
    description:
      'DEUX bonnes réponses sur trois. C’est le SEUL recours possible : aucun canal e-mail ni ' +
      'SMS n’existe (D-011). Le lot compte pour UNE tentative sur le compteur COMMUN — sans ' +
      'quoi cette route serait le contournement du blocage : on épuiserait le PIN, puis on ' +
      'tâtonnerait ici sans limite.',
  })
  @ApiOkResponse({ type: SuccessResponseDto })
  resetPin(@CurrentUser() actor: AuthenticatedActor, @Body() dto: ResetPinDto) {
    return this.stepUp.resetPin(actor.id, dto.answers, dto.newPin);
  }
}
