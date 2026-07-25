import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Le mot de passe est POSÉ par le SUPER_ADMIN, pas envoyé par e-mail : il n'existe aucun
 * fournisseur d'envoi (D-011), et prétendre « un lien vient d'être envoyé » serait mentir. Le
 * super-admin transmet donc le mot de passe hors plateforme, et le nouveau titulaire le changera.
 * C'est la même contrainte que celle qui laisse le reset de mot de passe des membres sans canal.
 */
const PASSWORD_MIN = 10;

export class CreateAdminUserDto {
  @ApiProperty({ example: 'Sarra Ben Amor' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'sarra@najah-partners.tn' })
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @ApiProperty({
    enum: AdminRole,
    description: 'Rôle FIXE. Les droits qui s’y attachent sont codés dans les guards du backend.',
  })
  @IsEnum(AdminRole)
  role!: AdminRole;

  @ApiProperty({
    minLength: PASSWORD_MIN,
    description:
      'Mot de passe initial, transmis hors plateforme (aucun envoi d’e-mail n’existe — D-011).',
  })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(200)
  password!: string;
}

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ example: 'Sarra Ben Amor' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: AdminRole })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @ApiPropertyOptional({
    description:
      'Désactiver révoque aussi les sessions en cours : sans cela, le compte resterait utilisable jusqu’à l’expiration de son jeton.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ResetAdminPasswordDto {
  @ApiProperty({
    minLength: PASSWORD_MIN,
    description: 'Nouveau mot de passe. Les sessions en cours du compte sont révoquées.',
  })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(200)
  password!: string;
}
