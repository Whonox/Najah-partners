import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MemberStatus,
  MembershipPaymentStatus,
  MembershipPaymentType,
} from '@prisma/client';

/**
 * File de validation des renouvellements (spec §7.2, D-038). Ces routes existaient depuis la
 * Tranche 7.5 mais sortaient SANS schéma (types Prisma bruts → `unknown` côté client généré) :
 * l'écran ne pouvait pas les consommer sans recopier des types à la main.
 *
 * ═══ AUCUN CHEMIN DE REFUS N'EST EXPOSÉ, ET C'EST DÉLIBÉRÉ ═══
 * Les e-cards sont brûlées AU PAIEMENT, avant la validation, et `USED` est irréversible (D-025).
 * Refuser signifierait décider du sort d'une valeur déjà sortie du système — valeur perdue,
 * recréditée au solde, autre ? C'est une décision métier NON TRANCHÉE (docs/decisions.md).
 * L'admin valide, ou laisse en attente.
 */
export class PendingRenewalDto {
  @ApiProperty({ description: 'Identifiant du paiement d’adhésion (c’est lui qu’on valide).' })
  id!: number;

  @ApiProperty() memberId!: number;
  @ApiProperty() memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({
    enum: MemberStatus,
    description:
      'État du membre À CET INSTANT. INACTIF : la validation le RÉACTIVERA (nouvelle baseline, carry-over d’avant le gel conservé — D-034). ACTIF : renouvellement anticipé, la validation ne fait que repousser l’échéance — surtout pas de nouvelle baseline.',
  })
  memberStatus!: MemberStatus;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Échéance actuelle du renouvellement annuel.',
  })
  renewalAt!: Date | null;

  @ApiProperty({ enum: MembershipPaymentType }) type!: MembershipPaymentType;
  @ApiProperty({ enum: MembershipPaymentStatus }) status!: MembershipPaymentStatus;

  @ApiProperty({
    example: '100.000',
    description: 'DINARS — montant FIGÉ au paiement (changer le tarif ne réécrit aucun versement passé).',
  })
  amountDt!: string;

  @ApiProperty() paidAt!: Date;
  @ApiPropertyOptional({ nullable: true }) validatedAt!: Date | null;

  @ApiProperty({
    type: [Number],
    description:
      'IDENTIFIANTS des e-cards brûlées pour ce paiement — JAMAIS leurs codes (un code est de la valeur au porteur).',
  })
  ecardIds!: number[];
}

/**
 * Le paiement d'adhésion tel que le rend le service (miroir de `MembershipPaymentView`). Sert de
 * schéma de réponse à la VALIDATION : elle renvoie le paiement passé à `VALIDATED`.
 *
 * L'écran n'a pas besoin qu'on lui dise si le membre a été « réactivé » ou simplement « prolongé » :
 * il connaît son état d'avant (il l'affichait dans la file) et sait donc lequel des deux messages
 * annoncer. Renvoyer l'information deux fois aurait créé deux vérités à garder d'accord.
 */
export class MembershipPaymentResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() memberId!: number;
  @ApiProperty() memberCode!: string;
  @ApiProperty({ enum: MembershipPaymentType }) type!: MembershipPaymentType;
  @ApiProperty({ enum: MembershipPaymentStatus }) status!: MembershipPaymentStatus;
  @ApiProperty({ example: '100.000', description: 'DINARS — montant figé au paiement.' })
  amountDt!: string;
  @ApiProperty() paidAt!: Date;
  @ApiPropertyOptional({ nullable: true }) validatedAt!: Date | null;
  @ApiProperty({ type: [Number], description: 'Ids des e-cards brûlées — jamais leurs codes.' })
  ecardIds!: number[];
}
