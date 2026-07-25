import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RunStatus } from '@prisma/client';

/**
 * Agrégats du tableau de bord (spec §7.2.1). Un seul appel, un seul schéma : l'écran
 * d'atterrissage ne doit pas déclencher douze requêtes dont chacune peut échouer séparément.
 *
 * INVARIANT D-028 JUSQU'AU CONTRAT : les deux dimensions ne se mélangent pas, et le NOM du
 * champ le dit. Tout ce qui est en dinars porte le suffixe `…Dt` et sort en CHAÎNE à
 * 3 décimales (un montant qui traverse un flottant JSON revient faux au millime près) ; tout
 * ce qui est en points est un `number` entier suffixé `…Bv`/`…Points` ; les Points Fidélité
 * (3ᵉ unité, D-032) ne portent ni l'un ni l'autre.
 */

export class DashboardMembersDto {
  @ApiProperty({ description: 'Tous états confondus.' }) total!: number;
  @ApiProperty({ description: 'ACTIF — perçoit des commissions.' }) active!: number;
  @ApiProperty({
    description: 'INSCRIT — payé son inscription, jamais activé : aucun point dans l’arbre.',
  })
  registered!: number;
  @ApiProperty({
    description: 'INACTIF — gel de non-renouvellement (D-034), ne perçoit plus rien.',
  })
  inactive!: number;
}

export class DashboardActivationsDto {
  @ApiProperty({ description: 'Depuis minuit, heure de Tunis.' }) today!: number;
  @ApiProperty({
    description:
      'Depuis la dernière clôture hebdomadaire (vendredi 23:59 Tunis, D-009) — la semaine du MOTEUR, pas la semaine civile.',
  })
  thisWeek!: number;
  @ApiProperty({ description: 'À vie.' }) total!: number;
}

export class DashboardPackRowDto {
  @ApiProperty() packId!: number;
  @ApiProperty() packName!: string;
  @ApiProperty({ description: 'POINTS — palier du pack.' }) tierBv!: number;
  @ApiProperty({ description: 'Membres activés sur ce pack.' }) memberCount!: number;
}

export class DashboardEcardsDto {
  @ApiProperty() activeCount!: number;
  @ApiProperty({ example: '12500.000', description: 'DINARS immobilisés dans des cartes ACTIVE.' })
  activeValueDt!: string;
  @ApiProperty() usedCount!: number;
  @ApiProperty({
    example: '48300.000',
    description: 'DINARS déjà consommés : cette valeur a QUITTÉ le système (D-025).',
  })
  usedValueDt!: string;
}

/**
 * « Les dinars dans le système », décomposés et JAMAIS agrégés en silence : une e-card active
 * est de la valeur qui a déjà quitté un solde sans avoir encore payé quoi que ce soit. Les
 * confondre avec les soldes ferait compter deux fois, ou disparaître, selon le sens de lecture.
 */
export class DashboardCirculationDto {
  @ApiProperty({ example: '31200.500', description: 'DINARS — somme des soldes des membres.' })
  memberBalancesDt!: string;
  @ApiProperty({ example: '12500.000', description: 'DINARS — valeur des e-cards ACTIVE.' })
  activeEcardsDt!: string;
  @ApiProperty({ example: '43700.500', description: 'DINARS — somme des deux lignes ci-dessus.' })
  totalDt!: string;
}

export class DashboardRunDto {
  @ApiProperty() id!: number;
  @ApiProperty() executedAt!: Date;
  @ApiProperty() periodStart!: Date;
  @ApiProperty() periodEnd!: Date;
  @ApiProperty({ description: 'Membres réglés par ce run.' }) memberCount!: number;
  @ApiProperty({ example: '18750.000', description: 'DINARS versés.' })
  distributedDt!: string;
  @ApiProperty({ description: 'Points Fidélité accordés (3ᵉ unité — D-032).' })
  rewardPointsGranted!: number;
  @ApiProperty({ enum: RunStatus }) status!: RunStatus;
}

/**
 * Les deux files de TÂCHES du back-office. Elles sont de nature opposée et l'écran doit le
 * dire : la vérification d'identité n'a jamais bloqué personne (D-018), la validation d'un
 * renouvellement, elle, décide si un membre gelé recommence à percevoir (D-038).
 */
export class DashboardTasksDto {
  @ApiProperty({ description: 'Membres en attente de vérification d’identité (non bloquant).' })
  identityPending!: number;
  @ApiProperty({ description: 'Renouvellements payés en attente de validation (bloquant).' })
  renewalsPending!: number;
}

export class DashboardSeriesPointDto {
  @ApiProperty({ example: '2026-07-25', description: 'Jour, en date civile de Tunis.' })
  day!: string;
  @ApiProperty() registrations!: number;
  @ApiProperty() activations!: number;
  @ApiProperty({ description: 'Effectif TOTAL du réseau à la fin de ce jour (courbe de croissance).' })
  cumulativeMembers!: number;
}

export class DashboardDto {
  @ApiProperty({ type: DashboardMembersDto }) members!: DashboardMembersDto;
  @ApiProperty({ type: DashboardActivationsDto }) activations!: DashboardActivationsDto;
  @ApiProperty({ type: [DashboardPackRowDto] }) packs!: DashboardPackRowDto[];
  @ApiProperty({ type: DashboardEcardsDto }) ecards!: DashboardEcardsDto;
  @ApiProperty({ type: DashboardCirculationDto }) circulation!: DashboardCirculationDto;
  @ApiProperty({ type: DashboardTasksDto }) tasks!: DashboardTasksDto;

  @ApiPropertyOptional({
    type: DashboardRunDto,
    nullable: true,
    description: 'Dernier run exécuté, quel que soit son statut. `null` si aucun run n’a jamais tourné.',
  })
  lastRun!: DashboardRunDto | null;

  @ApiProperty({
    description:
      'Prochaine clôture hebdomadaire (D-009), calculée depuis la MÊME expression cron que le déclencheur.',
  })
  nextRunAt!: Date;

  @ApiProperty({
    example: '184300.000',
    description: 'DINARS distribués depuis l’origine (runs en SUCCESS).',
  })
  totalDistributedDt!: string;

  @ApiProperty({ type: [DashboardSeriesPointDto], description: 'Une entrée par jour, sans trou.' })
  series!: DashboardSeriesPointDto[];
}
