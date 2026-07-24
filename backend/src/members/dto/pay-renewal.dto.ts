import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';
import { ECARD_CODE_PATTERN } from '../../ecards/ecard-code';
import { MAX_ECARDS_PER_PAYMENT } from '../../ecards/ecards.service';

/**
 * Règlement du renouvellement annuel (spec §5.9, D-038). Le paiement ne réactive rien par
 * lui-même : il ouvre une demande que l'administrateur validera.
 */
export class PayRenewalDto {
  @ApiProperty({
    type: [String],
    example: ['HHD-7Z7-JJD-77D'],
    description:
      'Codes des e-cards réglant le renouvellement. Leur SOMME doit valoir exactement le ' +
      'montant annuel (100 DT, paramétrable) : cumulables (D-030), ni appoint ni trop-perçu.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ECARDS_PER_PAYMENT)
  @IsString({ each: true })
  @Matches(ECARD_CODE_PATTERN, { each: true, message: 'Code e-card invalide.' })
  ecardCodes!: string[];
}
