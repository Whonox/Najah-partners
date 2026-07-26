import { ApiProperty } from '@nestjs/swagger';
import { Leg } from '@prisma/client';
import { IsEnum, IsString, Matches } from 'class-validator';

/**
 * Vérification PRÉALABLE du parrainage et du placement (D-052, précisée par D-061).
 *
 * Les trois valeurs voyagent ENSEMBLE, et c'est le cœur du dispositif : une route qui
 * répondrait « ce sponsor existe-t-il ? » serait un oracle sur l'annuaire des membres. En
 * n'acceptant que le triplet complet, la réponse ne porte que sur la COMBINAISON — « ce
 * placement est-il possible ? » —, jamais sur l'un de ses termes.
 */
export class CheckPlacementDto {
  @ApiProperty({ example: 'NP000963', description: 'Code du parrain.' })
  @IsString()
  @Matches(/^NP\d+$/, { message: 'Code sponsor invalide.' })
  sponsorCode!: string;

  @ApiProperty({
    example: 'NP000999',
    description: 'Code de l’upline de placement.',
  })
  @IsString()
  @Matches(/^NP\d+$/, { message: 'Code upline invalide.' })
  uplineCode!: string;

  @ApiProperty({ enum: Leg, description: 'Jambe visée sous l’upline.' })
  @IsEnum(Leg)
  leg!: Leg;
}

/**
 * Réponse : un booléen, et rien d'autre.
 *
 * Pas de champ `reason`, pas de code d'erreur détaillé, pas de liste de ce qui a échoué. Le
 * type lui-même interdit d'en dire plus — ajouter un motif demanderait de modifier ce DTO,
 * ce qui est exactement le genre de changement qu'on veut voir passer en relecture.
 */
export class PlacementCheckResultDto {
  @ApiProperty({
    description:
      'Le placement est possible EN L’ÉTAT. Ce n’est pas une réservation : la position peut ' +
      'être prise entre cette vérification et l’inscription, et c’est la transaction ' +
      'd’inscription qui tranche (D-036).',
  })
  ok!: boolean;
}
