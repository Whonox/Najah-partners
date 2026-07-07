import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token de réinitialisation (usage unique)' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ description: 'Nouveau mot de passe', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  newPassword!: string;
}
