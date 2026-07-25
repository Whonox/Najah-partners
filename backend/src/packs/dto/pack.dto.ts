import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Pack = un PALIER en points + un plan de rémunération en dinars (D-028/D-029). Les deux
 * dimensions cohabitent dans le même objet sans jamais se convertir :
 *  - `tierBv` : des POINTS. C'est ce que le panier doit totaliser à l'activation (D-006) et
 *    ce qui monte dans les jambes de l'arbre. Aucune valeur monétaire.
 *  - tout le reste en `…Dt` : des DINARS. Prix payé, commissions versées, plafond hebdomadaire.
 *
 * SNAPSHOT (spec §5.8) : modifier un pack ne réécrit RIEN. Les membres déjà activés portent
 * leur propre `activationSnapshot`, et le moteur de commissions lit ce snapshot — jamais
 * `Pack` en direct. Un changement ici ne vaut que pour les activations POSTÉRIEURES.
 */
export class CreatePackDto {
  @ApiProperty({ example: 'Silver' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiProperty({
    example: 1000,
    description:
      'POINTS — palier du pack : total exact du panier à l’activation, et points injectés dans l’arbre.',
  })
  @IsInt()
  @Min(1)
  tierBv!: number;

  @ApiProperty({
    example: 2200,
    description:
      'DINARS — prix du pack (D-029). L’acompte d’inscription en est déduit à l’activation (D-037).',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  priceDt!: number;

  @ApiProperty({
    example: 500,
    description: 'DINARS — commission DIRECTE versée au sponsor du filleul activé.',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  directCommissionDt!: number;

  @ApiProperty({
    example: 250,
    description: 'DINARS — commission INDIRECTE, versée PAR équilibre (cycle) complété.',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  indirectCommissionDt!: number;

  @ApiProperty({
    example: 10000,
    description:
      'DINARS — plafond HEBDOMADAIRE. Au-delà, la commission est PERDUE, jamais reportée (D-033).',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  weeklyCapDt!: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Un pack désactivé ne peut plus être choisi à l’activation. Jamais supprimé.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePackDto extends PartialType(CreatePackDto) {}

/**
 * Miroir de doc du modèle Prisma `Pack` : le plugin CLI `@nestjs/swagger` n'introspecte pas
 * les types Prisma, donc sans cette classe les routes sortiraient sans schéma et le client TS
 * des fronts retomberait en `unknown` (patron `ProductResponseDto`).
 *
 * Les montants DT sont sérialisés en CHAÎNE (`Prisma.Decimal#toJSON`), jamais en `number` :
 * c'est ainsi que la précision au millime survit à JSON. `tierBv`, lui, est un entier.
 */
export class PackResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'Silver' }) name!: string;

  @ApiProperty({ example: 1000, description: 'POINTS — palier.' })
  tierBv!: number;

  @ApiProperty({ example: '2200.000', description: 'DINARS.' }) priceDt!: string;
  @ApiProperty({ example: '500.000', description: 'DINARS.' })
  directCommissionDt!: string;
  @ApiProperty({ example: '250.000', description: 'DINARS — par équilibre.' })
  indirectCommissionDt!: string;
  @ApiProperty({ example: '10000.000', description: 'DINARS — plafond hebdomadaire.' })
  weeklyCapDt!: string;

  @ApiProperty() active!: boolean;

  @ApiProperty({
    description:
      'Nombre de membres ACTIVÉS sur ce pack. Rappel visuel que l’historique existe : le désactiver ne le réécrit pas, et le supprimer est impossible.',
  })
  memberCount!: number;
}

/**
 * Un pack tel qu'un AFFILIÉ le voit avant d'acheter (spec §7.1.4a).
 *
 * Reprend `PackResponseDto` MOINS `memberCount` : combien de membres ont acheté ce pack est un
 * indicateur d'exploitation, utile à l'administration, sans objet pour l'acheteur — et c'est
 * une donnée sur les autres membres, qui n'a pas à sortir sur la surface affilié, même agrégée.
 * Deux DTO plutôt qu'un champ optionnel qu'on oublierait de retirer un jour.
 *
 * `active` n'y figure pas non plus : la route ne rend que des packs actifs, un booléen
 * toujours vrai n'informe personne.
 */
export class PackOfferDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'Silver' }) name!: string;

  @ApiProperty({
    example: 1000,
    description:
      'POINTS — le palier. Le panier d’activation devra le totaliser EXACTEMENT (D-006), et c’est ce nombre qui sera injecté dans l’arbre.',
  })
  tierBv!: number;

  @ApiProperty({
    example: '2200.000',
    description:
      'DINARS — prix du pack. Le montant RÉELLEMENT dû à l’activation en déduit l’acompte d’inscription déjà versé (D-037).',
  })
  priceDt!: string;

  @ApiProperty({
    example: '500.000',
    description: 'DINARS — ce que touchera mon parrain quand j’activerai, et ce que je toucherai pour chacun de MES filleuls activés sur leur propre pack.',
  })
  directCommissionDt!: string;

  @ApiProperty({
    example: '250.000',
    description: 'DINARS — ce que rapporte chacun de mes équilibres.',
  })
  indirectCommissionDt!: string;

  @ApiProperty({
    example: '10000.000',
    description:
      'DINARS — plafond HEBDOMADAIRE. Au-delà, l’argent de la semaine est PERDU, jamais reporté (D-033).',
  })
  weeklyCapDt!: string;
}
