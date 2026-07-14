import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';
import { ECARD_CODE_PATTERN } from '../ecard-code';
import { normalizeEcardCode } from '../ecard-code';

export class VerifyEcardDto {
  @ApiProperty({
    description: 'Code e-card au format XXX-XXX-XXX-XXX.',
    example: 'HHD-7Z7-JJD-77D',
  })
  // Normalisation AVANT validation : un code recopié à la main arrive souvent en minuscules
  // ou entouré d'espaces — le rejeter sur la casse serait une fausse erreur de saisie.
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeEcardCode(value) : value,
  )
  // Le format est vérifié avant d'atteindre la base : une saisie malformée ne coûte pas de
  // requête, et le quota anti-brute-force ne s'épuise que sur des tentatives crédibles.
  @Matches(ECARD_CODE_PATTERN, {
    message: 'Code e-card invalide (format attendu : XXX-XXX-XXX-XXX).',
  })
  code!: string;
}
