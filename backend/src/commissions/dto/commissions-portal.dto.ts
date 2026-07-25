import { ApiProperty } from '@nestjs/swagger';

/**
 * MES commissions, semaine par semaine (spec §7.1 — le portail affilié).
 *
 * Ce que l'affilié doit pouvoir lire ici sans poser de question au support : d'où vient le
 * montant, pourquoi il a éventuellement été RABOTÉ, et ce qui a été perdu. D'où la ventilation
 * par nature d'événement (directes / équilibres / bonus) ET l'écart brut − versé, tous deux
 * rendus explicitement plutôt que laissés à un calcul côté écran.
 *
 * TOUS les montants sont en DINARS, en chaîne à 3 décimales. Les Points Fidélité sont une
 * TROISIÈME unité (D-032) : ni points d'arbre, ni dinars.
 */
export class MyCommissionRowDto {
  @ApiProperty() runId!: number;

  @ApiProperty({ description: 'Ouverture de la semaine du moteur.' })
  periodStart!: Date;

  @ApiProperty({ description: 'Clôture : vendredi 23:59, Tunis (D-009).' })
  periodEnd!: Date;

  @ApiProperty({ description: 'Exécution réelle du run.' })
  executedAt!: Date;

  @ApiProperty({
    example: '11000.000',
    description: 'DINARS — dû BRUT de la semaine, avant plafond.',
  })
  grossDt!: string;

  @ApiProperty({ example: '10000.000', description: 'DINARS — réellement crédité au solde.' })
  paidDt!: string;

  @ApiProperty({
    example: '1000.000',
    description:
      'DINARS — PERDU au plafond hebdomadaire. Jamais reporté sur la semaine suivante (D-033), contrairement aux POINTS non appariés, qui restent en réserve sans échéance.',
  })
  lostDt!: string;

  @ApiProperty({
    example: '10000.000',
    description: 'DINARS — le plafond appliqué, issu de MON snapshot d’activation.',
  })
  appliedCapDt!: string;

  @ApiProperty({ description: 'Nombre total d’événements réglés sur cette semaine.' })
  eventCount!: number;

  @ApiProperty({ description: 'Dont commissions DIRECTES (un filleul que j’ai parrainé s’est activé).' })
  directCount!: number;

  @ApiProperty({ description: 'Dont ÉQUILIBRES (un cycle complété sur mes deux jambes).' })
  balanceCount!: number;

  @ApiProperty({ description: 'Dont BONUS DE DÉMARRAGE (une fois à vie — D-031).' })
  startupBonusCount!: number;

  @ApiProperty({
    description:
      'Dont équilibres du 6ᵉ rang : ils ne paient AUCUN dinar et valent 1 Point Fidélité (D-032).',
  })
  rewardPointEventCount!: number;

  @ApiProperty({ description: 'Points Fidélité obtenus sur ce run.' })
  rewardPointsGranted!: number;

  @ApiProperty({
    description:
      'Points Fidélité PERDUS : leur équilibre est survenu après le franchissement du plafond.',
  })
  rewardPointsLost!: number;
}

export class MyCommissionPageDto {
  @ApiProperty({ type: [MyCommissionRowDto] }) items!: MyCommissionRowDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;

  @ApiProperty({
    example: '43000.000',
    description: 'DINARS — total RÉELLEMENT PERÇU sur toutes mes semaines, pas seulement la page.',
  })
  lifetimePaidDt!: string;

  @ApiProperty({
    example: '2500.000',
    description: 'DINARS — total PERDU au plafond sur toutes mes semaines.',
  })
  lifetimeLostDt!: string;
}
