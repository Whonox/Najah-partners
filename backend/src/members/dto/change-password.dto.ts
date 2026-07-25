import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Changement de MON mot de passe (spec §7.1.7).
 *
 * Le mot de passe ACTUEL est exigé, et ce n'est pas une formalité : un access token vit ~15 min
 * en mémoire d'onglet. Sans cette preuve, quiconque accéderait à une session ouverte pourrait
 * s'emparer du compte définitivement. C'est aussi la seule vérification possible ici — il
 * n'existe aucun canal de confirmation (D-011).
 */
export class ChangePasswordDto {
  @ApiProperty({ description: 'Mot de passe actuel — preuve de possession du compte.' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ description: 'Nouveau mot de passe.', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  newPassword!: string;
}
