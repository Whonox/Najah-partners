import { ApiProperty } from '@nestjs/swagger';
import { IdDocumentType, VerificationStatus } from '@prisma/client';
import { SECURITY_QUESTION_KEYS } from '../security-questions';

/**
 * État des trois étapes du parcours d'accueil (D-050). Le portail s'en sert pour savoir où
 * reprendre — il ne recalcule rien : `completed` est lu, jamais déduit des trois booléens.
 */
export class OnboardingStatusDto {
  @ApiProperty({
    description: 'Étape 1 — image de la pièce d’identité déposée.',
  })
  idDocumentUploaded!: boolean;

  @ApiProperty({
    description: 'Étape 2 — les trois questions secrètes sont enregistrées.',
  })
  securityQuestionsSet!: boolean;

  @ApiProperty({ description: 'Étape 3 — le code PIN est créé.' })
  pinSet!: boolean;

  @ApiProperty({
    description:
      'Les trois étapes sont faites : le portail est ouvert. Valeur LUE en base (colonne ' +
      '`onboardingCompletedAt`), pas recalculée — c’est elle que le garde serveur applique.',
  })
  completed!: boolean;

  @ApiProperty({
    enum: IdDocumentType,
    nullable: true,
    description:
      'Type SAISI à l’inscription (D-039), rappelé à l’écran au moment de déposer l’image.',
  })
  idDocumentType!: IdDocumentType | null;

  @ApiProperty({
    nullable: true,
    example: '09876543',
    description: 'Numéro SAISI à l’inscription (D-039), rappelé à l’écran.',
  })
  idDocumentNumber!: string | null;

  @ApiProperty({
    enum: VerificationStatus,
    description:
      'Vérification par l’admin — INFORMATIVE, elle ne bloque RIEN (D-018). À ne pas ' +
      'confondre avec le parcours d’accueil, qui lui est bloquant.',
  })
  verificationStatus!: VerificationStatus;
}

/**
 * Catalogue des questions secrètes : des CLÉS, jamais des libellés (D-057).
 *
 * Le français vit dans `portal/src/i18n/fr.ts`, où TypeScript échoue à la compilation si une
 * clé n'a pas de libellé. Faire voyager le texte par l'API aurait dispersé les libellés
 * utilisateur entre deux dépôts et rendu impossible la traduction AR/RTL sans redéploiement
 * du backend.
 */
export class SecurityQuestionsCatalogDto {
  @ApiProperty({
    type: [String],
    enum: SECURITY_QUESTION_KEYS,
    example: [...SECURITY_QUESTION_KEYS],
  })
  keys!: string[];

  @ApiProperty({
    example: 3,
    description: 'Nombre de questions que le membre doit choisir.',
  })
  required!: number;
}
