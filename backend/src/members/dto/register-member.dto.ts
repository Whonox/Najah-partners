import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdDocumentType, Leg } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Formulaire d'inscription (spec §5.3, D-021 : endpoint public). Envoyé en
 * `multipart/form-data` — la pièce d'identité (D-018) accompagne les champs.
 *
 * Attention : en multipart, TOUTES les valeurs arrivent en `string`. Aucun champ numérique
 * ici, donc aucune conversion à prévoir ; les libellés restent en français (utilisateur final).
 */
export class RegisterMemberDto {
  @ApiProperty({ example: 'Ben Salah' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({ example: 'Mohamed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @ApiPropertyOptional({
    example: 'mohamed@example.tn',
    description: 'E-mail ou téléphone : au moins l’un des deux est requis (contrôlé au service).',
  })
  @IsOptional()
  @IsEmail({}, { message: 'E-mail invalide.' })
  @MaxLength(180)
  email?: string;

  @ApiPropertyOptional({ example: '+21620123456' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ minLength: 8, example: 'MotDePasse123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignore silencieusement les octets au-delà de 72
  password!: string;

  @ApiProperty({ example: 'NP000963', description: 'Code du parrain (commission directe).' })
  @IsString()
  @Matches(/^NP\d+$/, { message: 'Code sponsor invalide (format attendu : NP000963).' })
  sponsorCode!: string;

  @ApiProperty({
    example: 'NP000964',
    description:
      'Code de l’upline de placement (position dans l’arbre). Doit appartenir au réseau du sponsor.',
  })
  @IsString()
  @Matches(/^NP\d+$/, { message: 'Code upline invalide (format attendu : NP000964).' })
  uplineCode!: string;

  @ApiProperty({ enum: Leg, example: Leg.LEFT, description: 'Jambe sous l’upline.' })
  @IsEnum(Leg)
  leg!: Leg;

  @ApiProperty({
    enum: IdDocumentType,
    description: 'Type de la pièce d’identité jointe (D-018).',
  })
  @IsEnum(IdDocumentType)
  idDocumentType!: IdDocumentType;

  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Image de la pièce d’identité (JPEG, PNG, WebP ou PDF, 5 Mo max).',
  })
  @IsOptional() // le fichier est porté par multer, pas par le corps validé
  idDocument?: unknown;
}
