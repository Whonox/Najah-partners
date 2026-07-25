import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdDocumentType, VerificationStatus } from '@prisma/client';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Statuer sur la vérification d'identité d'un membre (D-018, D-039).
 *
 * Le statut d'ENTRÉE `PENDING` n'est pas proposé : on ne « remet pas en attente » un dossier
 * déjà tranché. Un admin qui s'est trompé rectifie en posant l'autre verdict — ce qui laisse
 * deux lignes d'audit, alors qu'un retour à PENDING effacerait la trace du premier verdict tout
 * en donnant l'impression que personne n'a jamais regardé.
 */
export class VerifyIdentityDto {
  @ApiProperty({
    enum: [VerificationStatus.VERIFIED, VerificationStatus.REJECTED],
    description: 'Verdict de l’admin après comparaison du numéro saisi et de l’image.',
  })
  @IsIn([VerificationStatus.VERIFIED, VerificationStatus.REJECTED])
  status!: typeof VerificationStatus.VERIFIED | typeof VerificationStatus.REJECTED;

  @ApiPropertyOptional({
    description:
      'Motif — OBLIGATOIRE pour un rejet (le membre doit savoir quoi corriger), REFUSÉ pour une validation (il n’y a rien à motiver).',
    example: 'Le numéro saisi ne correspond pas à celui de la pièce.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

/**
 * Réponse : l'état de vérification APRÈS l'action, et rien d'autre. Volontairement étroit — cette
 * route ne touche que la vérification, et renvoyer une fiche membre complète laisserait croire
 * qu'elle a pu modifier autre chose.
 */
export class VerificationResultDto {
  @ApiProperty() memberId!: number;
  @ApiProperty() memberCode!: string;
  @ApiProperty({ enum: VerificationStatus }) verificationStatus!: VerificationStatus;
  @ApiPropertyOptional({ nullable: true }) verificationReason!: string | null;
  @ApiProperty() verificationAt!: Date;
  @ApiProperty({ description: 'Admin auteur du verdict.' }) verificationByAdminId!: number;
  @ApiPropertyOptional({ nullable: true, enum: IdDocumentType })
  idDocumentType!: IdDocumentType | null;
}
