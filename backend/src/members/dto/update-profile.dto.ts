import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Mise à jour de MON profil (spec §7.1.7).
 *
 * ═══ NI E-MAIL NI TÉLÉPHONE (D-049) ═══
 * Ce sont des IDENTIFIANTS DE CONNEXION (`/auth/member/login` accepte e-mail, téléphone ou code
 * membre), et il n'existe AUCUN canal de confirmation : pas d'e-mail transactionnel, pas de SMS
 * (D-011). Un membre qui saisit « gmial.com » se verrouillerait donc hors de son compte, et le
 * « mot de passe oublié » ne le rattraperait pas — il passe par le même canal inexistant. Le
 * champ est absent du CONTRAT, pas seulement grisé à l'écran : une requête forgée ne peut pas
 * le modifier. La correction passe par l'administration.
 * À ROUVRIR le jour où un canal de confirmation (OTP) existera — cela réviserait D-011/D-049.
 *
 * Aucune donnée bancaire n'est collectée nulle part (pas de KYC financier).
 */
export class UpdateMemberProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName?: string;
}
