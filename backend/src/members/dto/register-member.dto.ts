import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdDocumentType, Leg } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ECARD_CODE_PATTERN } from '../../ecards/ecard-code';
import { MAX_ECARDS_PER_PAYMENT } from '../../ecards/ecards.service';

/**
 * Formulaire d'inscription (spec §5.3, D-021 : endpoint public). Envoyé en
 * `multipart/form-data` — la pièce d'identité (D-018) accompagne les champs.
 *
 * Attention : en multipart, TOUTES les valeurs arrivent en `string`. Aucun champ numérique
 * ici, donc aucune conversion à prévoir ; les libellés restent en français (utilisateur final).
 * Un champ répété une seule fois arrive en `string` et non en tableau — d'où le `@Transform`
 * sur `ecardCodes`.
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
    description:
      'E-mail ou téléphone : au moins l’un des deux est requis (contrôlé au service).',
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

  @ApiProperty({
    example: 'NP000963',
    description: 'Code du parrain (commission directe).',
  })
  @IsString()
  @Matches(/^NP\d+$/, {
    message: 'Code sponsor invalide (format attendu : NP000963).',
  })
  sponsorCode!: string;

  @ApiProperty({
    example: 'NP000964',
    description:
      'Code de l’upline de placement (position dans l’arbre). Doit appartenir au réseau du sponsor.',
  })
  @IsString()
  @Matches(/^NP\d+$/, {
    message: 'Code upline invalide (format attendu : NP000964).',
  })
  uplineCode!: string;

  @ApiProperty({
    enum: Leg,
    example: Leg.LEFT,
    description: 'Jambe sous l’upline.',
  })
  @IsEnum(Leg)
  leg!: Leg;

  @ApiProperty({
    type: [String],
    example: ['HHD-7Z7-JJD-77D', 'K4M-8P2-QRS-33T'],
    description:
      'Codes des e-cards réglant les frais d’inscription (D-036). Leur SOMME doit valoir ' +
      'exactement 100 DT (paramétrable) : plusieurs cartes sont cumulables (D-030), ni ' +
      'appoint ni trop-perçu. Sans e-card valide, pas d’inscription.',
  })
  // Un champ multipart présent une seule fois arrive en `string` : on normalise en tableau
  // avant validation, sinon `@IsArray` refuserait une inscription réglée par une seule carte.
  @Transform(({ value }) =>
    value === undefined || Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @ArrayMinSize(1)
  // Plafond de sécurité (RÉVISE D-030, « nombre illimité ») : cet endpoint est public et
  // anonyme, chaque code supplémentaire y est un essai de plus contre le quota par IP.
  @ArrayMaxSize(MAX_ECARDS_PER_PAYMENT)
  @IsString({ each: true })
  @Matches(ECARD_CODE_PATTERN, { each: true, message: 'Code e-card invalide.' })
  ecardCodes!: string[];

  @ApiProperty({
    enum: IdDocumentType,
    description: 'Type de la pièce d’identité jointe (D-018).',
  })
  @IsEnum(IdDocumentType)
  idDocumentType!: IdDocumentType;

  @ApiProperty({
    example: '09876543',
    description:
      'Numéro de la pièce d’identité, saisi à la main (D-039). L’admin le compare à ' +
      'l’image ; la vérification reste NON bloquante.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  idDocumentNumber!: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'Image de la pièce (JPEG, PNG, WebP ou PDF, 5 Mo max). **N’est plus attendue ici** ' +
      '(D-050/D-060) : elle se dépose à la PREMIÈRE CONNEXION, sous identité connue, via ' +
      '`POST /members/me/onboarding/id-document`. Cet endpoint est public et anonyme (D-021) ' +
      '— il n’a pas à recevoir un binaire de 5 Mo d’un inconnu. Le champ reste toléré pour ' +
      'les appelants internes (seed, tests) qui fournissent le dossier d’un bloc.',
  })
  @IsOptional() // le fichier est porté par multer, pas par le corps validé
  idDocument?: unknown;
}
