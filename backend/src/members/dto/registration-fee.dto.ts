import { ApiProperty } from '@nestjs/swagger';

/**
 * Tarif d'inscription, exposé PUBLIQUEMENT (D-036, D-052).
 *
 * Ne porte QUE le montant. Aucune autre clé de paramétrage n'a à sortir par cette route :
 * l'écran d'inscription a besoin de savoir combien composer, rien de plus. Rendre l'objet
 * `Setting` entier — ou pire, la liste — exposerait la configuration du système à un endpoint
 * anonyme.
 */
export class RegistrationFeeDto {
  @ApiProperty({
    example: '100.000',
    description:
      'DINARS — montant à couvrir EXACTEMENT par une ou plusieurs e-cards (D-030). Ce ' +
      'montant vaut ACOMPTE : il sera déduit du prix du pack à l’activation (D-037). Il est ' +
      'figé sur le membre au paiement — le changer demain ne réécrit aucun acompte versé.',
  })
  amountDt!: string;
}
