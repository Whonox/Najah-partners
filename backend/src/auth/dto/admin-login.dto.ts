import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@najah.local' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ description: 'Mot de passe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password!: string;
}
