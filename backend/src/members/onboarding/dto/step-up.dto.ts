import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH } from '../pin';
import {
  ANSWERS_REQUIRED_FOR_PIN_RESET,
  REQUIRED_SECURITY_ANSWERS,
  SECURITY_QUESTION_KEYS,
} from '../security-questions';
import { SecurityAnswerDto } from './onboarding.dto';

/**
 * Vérification de seconde authentification (D-051).
 *
 * UN SEUL corps pour les DEUX voies, distinguées par `method` : les rendre symétriques dans
 * le contrat rappelle qu'elles sont équivalentes — le membre choisit, aucune n'est un repli
 * de l'autre.
 */
export class VerifyStepUpDto {
  @ApiProperty({
    enum: ['PIN', 'QUESTION'],
    description:
      'Voie choisie par le membre. Les deux sont ÉQUIVALENTES (D-051) et partagent le même ' +
      'compteur d’essais : épuiser l’une n’ouvre pas l’autre.',
  })
  @IsIn(['PIN', 'QUESTION'])
  method!: 'PIN' | 'QUESTION';

  @ApiPropertyOptional({
    example: '4827',
    minLength: MIN_PIN_LENGTH,
    maxLength: MAX_PIN_LENGTH,
    description: 'Requis si `method = PIN`.',
  })
  @IsOptional()
  @IsString()
  @MinLength(MIN_PIN_LENGTH)
  @MaxLength(MAX_PIN_LENGTH)
  pin?: string;

  @ApiPropertyOptional({
    description:
      'Jeton rendu par `POST /step-up/challenge`, requis si `method = QUESTION`. Il PORTE la ' +
      'question tirée : sans ce lien, le tirage aléatoire serait décoratif — le client ' +
      'répondrait à celle de son choix.',
  })
  @IsOptional()
  @IsString()
  challengeToken?: string;

  @ApiPropertyOptional({
    example: 'Ibn Khaldoun',
    description:
      'Réponse à la question du défi. Normalisée (accents, espaces, casse) avant comparaison.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  answer?: string;
}

/** Réinitialisation d'un PIN oublié par les questions secrètes (D-058). */
export class ResetPinDto {
  @ApiProperty({
    type: [SecurityAnswerDto],
    minItems: ANSWERS_REQUIRED_FOR_PIN_RESET,
    maxItems: REQUIRED_SECURITY_ANSWERS,
    description:
      `Au moins ${ANSWERS_REQUIRED_FOR_PIN_RESET} bonnes réponses sont exigées. C’est le SEUL ` +
      'recours : aucun canal e-mail ni SMS n’existe (D-011). Le lot compte pour UNE tentative ' +
      'sur le compteur commun — répondre à deux questions en un geste n’est pas deux essais.',
  })
  @IsArray()
  @ArrayMinSize(ANSWERS_REQUIRED_FOR_PIN_RESET)
  @ArrayMaxSize(REQUIRED_SECURITY_ANSWERS)
  @ValidateNested({ each: true })
  @Type(() => SecurityAnswerDto)
  answers!: SecurityAnswerDto[];

  @ApiProperty({
    example: '5931',
    minLength: MIN_PIN_LENGTH,
    maxLength: MAX_PIN_LENGTH,
    description:
      'Nouveau PIN. Sa FORME est contrôlée avant que la moindre tentative ne soit débitée : ' +
      'se voir refuser un PIN trop simple ne doit pas consommer un essai.',
  })
  @IsString()
  @MinLength(MIN_PIN_LENGTH)
  @MaxLength(MAX_PIN_LENGTH)
  newPin!: string;
}

/** Le défi : une question tirée au hasard parmi les trois, liée à un jeton. */
export class StepUpChallengeDto {
  @ApiProperty({
    enum: SECURITY_QUESTION_KEYS,
    description:
      'CLÉ de la question tirée — le libellé français vit dans l’interface (D-057).',
  })
  questionKey!: string;

  @ApiProperty({
    description:
      'À renvoyer tel quel à `verify`. Il porte la question : on ne peut pas répondre à une ' +
      'autre que celle qui a été tirée.',
  })
  challengeToken!: string;

  @ApiProperty()
  expiresAt!: Date;
}

/** Le jeton de seconde authentification, à présenter en en-tête `X-Step-Up`. */
export class StepUpTokenDto {
  @ApiProperty({
    description:
      'À présenter dans l’en-tête `X-Step-Up` des opérations sensibles. Valable 10 minutes ' +
      '(D-058) : assez pour composer un panier et payer, assez court pour qu’un poste laissé ' +
      'ouvert ne reste pas une session d’argent.',
  })
  stepUpToken!: string;

  @ApiProperty()
  expiresAt!: Date;
}
