import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CommissionEventType,
  MemberStatus,
  RunStatus,
} from '@prisma/client';

/**
 * Supervision des runs (spec §7.2.7). Le back-office SUPERVISE : il ne calcule rien, il ne
 * relance rien de lui-même. Tous les montants sont en DINARS, en CHAÎNE à 3 décimales (D-028) ;
 * les Points Fidélité sont une TROISIÈME unité (D-032) et n'ont donc ni suffixe `…Dt` ni `…Bv`.
 */

export class RunSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty() executedAt!: Date;
  @ApiProperty({ description: 'Début INCLUS de la semaine réglée.' }) periodStart!: Date;
  @ApiProperty({ description: 'Fin EXCLUE (clôture vendredi 23:59 Tunis).' }) periodEnd!: Date;
  @ApiProperty({ description: 'Membres ayant reçu un versement.' }) memberCount!: number;
  @ApiProperty({ example: '18750.000', description: 'DINARS versés par ce run.' })
  distributedDt!: string;
  @ApiProperty({ description: 'Points Fidélité accordés (D-032).' })
  rewardPointsGranted!: number;
  @ApiProperty({ enum: RunStatus }) status!: RunStatus;
  @ApiProperty({ description: 'Le run porte-t-il un journal d’exécution ?' })
  hasLog!: boolean;
}

export class RunPageDto {
  @ApiProperty({ type: [RunSummaryDto] }) items!: RunSummaryDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class RunMemberRefDto {
  @ApiProperty() id!: number;
  @ApiProperty() memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: MemberStatus }) status!: MemberStatus;
}

/**
 * Le règlement d'UN membre sur un run. `lostDt` est l'information la plus contre-intuitive de
 * la plateforme et elle est donc explicite dans le contrat : c'est de l'argent DÉFINITIVEMENT
 * perdu (D-033), à ne jamais confondre avec les POINTS non appariés, qui sont eux reportés
 * sans échéance.
 */
export class RunMemberRowDto {
  @ApiProperty({ type: RunMemberRefDto }) member!: RunMemberRefDto;
  @ApiProperty({ example: '11000.000', description: 'DINARS — total éligible AVANT plafond.' })
  grossDt!: string;
  @ApiProperty({ example: '10000.000', description: 'DINARS réellement versés.' })
  paidDt!: string;
  @ApiProperty({
    example: '1000.000',
    description: 'DINARS PERDUS au plafond — jamais reportés (D-033). = brut − versé.',
  })
  lostDt!: string;
  @ApiProperty({
    example: '10000.000',
    description: 'Plafond appliqué, issu du SNAPSHOT d’activation du membre — jamais du pack vivant.',
  })
  appliedCapDt!: string;
  @ApiProperty() eventCount!: number;
  @ApiProperty({ description: 'Points Fidélité accordés sous le plafond.' })
  rewardPointsGranted!: number;
  @ApiProperty({ description: 'Points Fidélité perdus (survenus après le plafond).' })
  rewardPointsLost!: number;
}

export class RunMemberPageDto {
  @ApiProperty({ type: [RunMemberRowDto] }) items!: RunMemberRowDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class RunDetailDto {
  @ApiProperty({ type: RunSummaryDto }) run!: RunSummaryDto;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Journal d’exécution (texte libre écrit par le run, `null` s’il n’y en a pas).',
  })
  log!: string | null;
  @ApiProperty({ example: '19750.000', description: 'DINARS — somme des bruts de tous les membres.' })
  grossTotalDt!: string;
  @ApiProperty({
    example: '1000.000',
    description: 'DINARS perdus au plafond sur l’ensemble du run.',
  })
  lostTotalDt!: string;
  @ApiProperty({ description: 'Points Fidélité perdus au plafond sur l’ensemble du run.' })
  rewardPointsLost!: number;
  @ApiProperty({ description: 'Événements réclamés par ce run (éligibles et inéligibles).' })
  eventCount!: number;
  @ApiProperty({
    description:
      'Événements réclamés mais INÉLIGIBLES (bénéficiaire gelé ou INSCRIT — D-034) : soldés, jamais payés.',
  })
  ineligibleEventCount!: number;
  @ApiProperty({
    example: '500.000',
    description: 'DINARS que ces événements inéligibles auraient valus.',
  })
  ineligibleGrossDt!: string;
  @ApiProperty({
    description:
      'Bénéficiaires n’ayant reçu AUCUN règlement (tous leurs événements étaient inéligibles) — ils n’apparaissent pas dans la décomposition par membre.',
  })
  unsettledMemberCount!: number;
}

/**
 * UN événement dans la chronologie d'un membre (D-035). Les trois derniers champs ne sont pas
 * stockés : ils viennent de `settleWeek`, la fonction qui a réglé le run — c'est ce qui permet
 * de montrer POURQUOI un montant s'arrête là.
 */
export class RunEventDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: CommissionEventType }) type!: CommissionEventType;
  @ApiProperty({
    example: '250.000',
    description: 'DINARS dus par l’événement — toujours 0 pour un REWARD_POINT (D-032).',
  })
  amountDt!: string;
  @ApiProperty({ description: 'Horodatage RÉEL de la transaction d’activation (porte la chronologie).' })
  occurredAt!: Date;
  @ApiProperty({ type: RunMemberRefDto, description: 'Le filleul dont l’activation a produit l’événement.' })
  sourceMember!: RunMemberRefDto;
  @ApiProperty({
    description:
      'Éligibilité évaluée AU MOMENT de l’événement (D-034) : un bénéficiaire gelé ou INSCRIT donne `false` — tracé, jamais payé.',
  })
  eligible!: boolean;
  @ApiPropertyOptional({
    nullable: true,
    description: 'N° d’équilibre À VIE (D-032) — `null` pour une commission directe.',
  })
  balanceIndex!: number | null;

  @ApiProperty({ example: '9800.000', description: 'DINARS — cumul de la semaine AVANT cet événement.' })
  cumulativeBeforeDt!: string;
  @ApiProperty({ example: '200.000', description: 'DINARS effectivement versés par cet événement.' })
  paidDt!: string;
  @ApiProperty({
    example: '50.000',
    description:
      'DINARS perdus AU PLAFOND sur cet événement (D-033). Vaut 0 pour un événement INÉLIGIBLE : cette somme n’a jamais été due — c’est `eligible` qui le dit, pas ce montant.',
  })
  lostDt!: string;
  @ApiProperty({ description: 'Cet événement FRANCHIT le plafond : il est payé partiellement.' })
  crossesCap!: boolean;
  @ApiProperty({ description: 'Point Fidélité accordé par cet événement.' })
  rewardPointGranted!: boolean;
  @ApiProperty({ description: 'Point Fidélité perdu (événement survenu après le plafond).' })
  rewardPointLost!: boolean;
}

export class RunMemberEventsDto {
  @ApiProperty({ type: RunMemberRefDto }) member!: RunMemberRefDto;
  @ApiPropertyOptional({
    nullable: true,
    example: '10000.000',
    description:
      'Plafond appliqué à cette semaine (snapshot d’activation). `null` si aucun règlement n’a eu lieu — tous les événements étaient inéligibles, le plafond n’a jamais eu à s’appliquer.',
  })
  appliedCapDt!: string | null;
  @ApiProperty({ example: '11000.000' }) grossDt!: string;
  @ApiProperty({ example: '10000.000' }) paidDt!: string;
  @ApiProperty({ example: '1000.000' }) lostDt!: string;
  @ApiProperty({
    type: [RunEventDto],
    description: 'Ordre chronologique STRICT `(occurredAt, id)` — l’ordre même d’application du plafond.',
  })
  events!: RunEventDto[];
}

/**
 * Les événements pas encore réclamés par un run (`runId IS NULL`) : « ce que le prochain run
 * paiera, sous réserve du plafond ». Le montant affiché est donc un DÛ BRUT, pas une promesse.
 */
export class PendingEventsDto {
  @ApiProperty() eventCount!: number;
  @ApiProperty({ description: 'Bénéficiaires distincts concernés.' }) memberCount!: number;
  @ApiProperty({
    example: '4300.000',
    description: 'DINARS dus par les événements ÉLIGIBLES — avant application des plafonds.',
  })
  eligibleGrossDt!: string;
  @ApiProperty({
    example: '500.000',
    description: 'DINARS tracés mais jamais payables (bénéficiaire gelé ou INSCRIT — D-034).',
  })
  ineligibleGrossDt!: string;
  @ApiProperty({ description: 'Début de la période en cours (dernière clôture atteinte).' })
  periodStart!: Date;
  @ApiProperty({ description: 'Prochaine clôture — l’instant où ces événements seront réglés.' })
  periodEnd!: Date;
}
