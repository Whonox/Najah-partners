import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Révocation d'une e-card par l'admin.
 *
 * Le motif est OBLIGATOIRE (Tranche 8c) : révoquer déplace de la valeur — la carte meurt et son
 * créateur est recrédité (D-025) — et le corps de la requête était jusqu'ici un objet anonyme
 * sans schéma, ce qui laissait passer une révocation sans aucune justification dans l'audit.
 * Une ligne d'audit qui dit seulement « la carte 42 a été révoquée » n'explique rien six mois
 * plus tard.
 */
export class RevokeEcardDto {
  @ApiProperty({
    description: 'Motif OBLIGATOIRE (tracé dans l’AuditLog).',
    example: 'Carte transmise par erreur au mauvais bénéficiaire',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
