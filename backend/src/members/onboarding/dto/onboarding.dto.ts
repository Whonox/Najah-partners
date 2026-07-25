import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH } from '../pin';
import {
  REQUIRED_SECURITY_ANSWERS,
  SECURITY_QUESTION_KEYS,
} from '../security-questions';

/** Une question choisie et sa réponse. La réponse est normalisée puis hachée côté service. */
export class SecurityAnswerDto {
  @ApiProperty({
    enum: SECURITY_QUESTION_KEYS,
    example: 'FIRST_SCHOOL',
    description:
      'Clé du catalogue (`GET /security-questions`). Le LIBELLÉ est porté par l’interface, ' +
      'jamais par l’API : les clés sont du code (D-015), les libellés du français.',
  })
  @IsString()
  @IsIn(SECURITY_QUESTION_KEYS)
  questionKey!: string;

  @ApiProperty({
    example: 'École Ibn Khaldoun',
    minLength: 2,
    maxLength: 120,
    description:
      'Réponse en clair. Elle est NORMALISÉE (accents dépliés, espaces réduits, minuscules) ' +
      'puis hachée : la comparaison est donc insensible à la casse et aux espaces, et la ' +
      'valeur saisie n’est stockée nulle part.',
  })
  @IsString()
  @MinLength(1) // la vraie borne s'applique à la forme NORMALISÉE, côté service
  @MaxLength(120)
  answer!: string;
}

/** Étape 2 du parcours d'accueil : les trois questions secrètes (D-050). */
export class SetSecurityQuestionsDto {
  @ApiProperty({
    type: [SecurityAnswerDto],
    minItems: REQUIRED_SECURITY_ANSWERS,
    maxItems: REQUIRED_SECURITY_ANSWERS,
    description: `Exactement ${REQUIRED_SECURITY_ANSWERS} questions, toutes DIFFÉRENTES.`,
  })
  @IsArray()
  @ArrayMinSize(REQUIRED_SECURITY_ANSWERS)
  @ArrayMaxSize(REQUIRED_SECURITY_ANSWERS)
  @ValidateNested({ each: true })
  @Type(() => SecurityAnswerDto)
  answers!: SecurityAnswerDto[];
}

/** Étape 3 du parcours d'accueil : création du PIN (D-050). */
export class SetPinDto {
  @ApiProperty({
    example: '4827',
    minLength: MIN_PIN_LENGTH,
    maxLength: MAX_PIN_LENGTH,
    description:
      `De ${MIN_PIN_LENGTH} à ${MAX_PIN_LENGTH} chiffres. Les codes trop devinables ` +
      '(chiffres identiques ou qui se suivent) sont refusés : avec 5 essais avant blocage, ' +
      'ce sont exactement ceux qu’un attaquant essaie en premier.',
  })
  @IsString()
  @MinLength(MIN_PIN_LENGTH)
  @MaxLength(MAX_PIN_LENGTH)
  pin!: string;
}
