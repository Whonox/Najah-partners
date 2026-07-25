import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderContext, RunStatus } from '@prisma/client';

/**
 * Rapports et analytics (spec §7.2.10). Tous les agrégats sont calculés par Postgres sur des
 * lignes déjà écrites : aucun rapport ne recalcule une règle métier, aucun ne convertit un point
 * en dinar (D-028 — les deux colonnes coexistent, elles ne se déduisent pas l'une de l'autre).
 *
 * L'EXPORT CSV n'est pas une route : le front écrit le fichier depuis le JSON qu'il a déjà reçu.
 * Une route d'export aurait dupliqué chaque requête, chaque filtre et chaque en-tête de colonne —
 * deux implémentations à garder d'accord pour le même tableau.
 */

export class ProductSalesRowDto {
  @ApiProperty() productId!: number;
  @ApiProperty() productName!: string;
  @ApiPropertyOptional({ nullable: true }) categoryName!: string | null;
  @ApiProperty({ description: 'Unités vendues (toutes commandes PAID de la période).' })
  quantity!: number;
  @ApiProperty({
    example: '1520.000',
    description:
      'DINARS — Σ (prix effectif SNAPSHOTÉ × quantité). C’est ce que les lignes valaient, pas ce que la commande a fait payer : en ACTIVATION, le montant encaissé est le prix du pack (D-029).',
  })
  totalDt!: string;
  @ApiProperty({
    example: 4000,
    description: 'POINTS — Σ (valeur BV snapshotée × quantité). Ne se déduit PAS du montant ci-dessus.',
  })
  totalPoints!: number;
  @ApiProperty({ description: 'Commandes distinctes contenant ce produit.' })
  orderCount!: number;
}

export class ActivationsByPackRowDto {
  @ApiProperty() packId!: number;
  @ApiProperty() packName!: string;
  @ApiProperty({ description: 'POINTS — palier du pack.' }) tierBv!: number;
  @ApiProperty({ description: 'Activations de la période.' }) activationCount!: number;
  @ApiProperty({
    example: '10500.000',
    description:
      'DINARS réellement encaissés à l’activation (prix du pack MOINS l’acompte d’inscription — D-037).',
  })
  collectedDt!: string;
  @ApiProperty({
    example: 5000,
    description: 'POINTS injectés dans l’arbre par ces activations (palier ENTIER — l’acompte ne touche que l’argent).',
  })
  injectedPoints!: number;
}

export class CommissionsPeriodRowDto {
  @ApiProperty() runId!: number;
  @ApiProperty() periodStart!: Date;
  @ApiProperty() periodEnd!: Date;
  @ApiProperty() executedAt!: Date;
  @ApiProperty({ enum: RunStatus }) status!: RunStatus;
  @ApiProperty() memberCount!: number;
  @ApiProperty({ example: '18750.000', description: 'DINARS versés.' }) paidDt!: string;
  @ApiProperty({
    example: '19750.000',
    description: 'DINARS éligibles avant plafond (Σ des bruts des membres).',
  })
  grossDt!: string;
  @ApiProperty({
    example: '1000.000',
    description: 'DINARS PERDUS au plafond — jamais reportés (D-033).',
  })
  lostDt!: string;
  @ApiProperty({ description: 'Points Fidélité accordés (D-032).' }) rewardPointsGranted!: number;
  @ApiProperty({ description: 'Points Fidélité perdus au plafond.' }) rewardPointsLost!: number;
}

/**
 * « Les dinars en circulation ». Décomposé, parce qu'agréger sans dire quoi induirait en erreur :
 * une e-card ACTIVE est de la valeur DÉJÀ sortie d'un solde et qui n'a encore rien payé, tandis
 * qu'une e-card USED a quitté le système pour de bon (D-025).
 */
export class CirculationReportDto {
  @ApiProperty({ example: '31200.500', description: 'DINARS — somme des soldes des membres.' })
  memberBalancesDt!: string;
  @ApiProperty({ example: '12500.000', description: 'DINARS immobilisés dans des e-cards ACTIVE.' })
  activeEcardsDt!: string;
  @ApiProperty({
    example: '43700.500',
    description: 'DINARS présents dans le système = soldes + e-cards actives.',
  })
  inSystemDt!: string;
  @ApiProperty({
    example: '148300.000',
    description: 'DINARS SORTIS du système par consommation d’e-cards (USED) — depuis l’origine.',
  })
  consumedEcardsDt!: string;
  @ApiProperty({
    example: '2200.000',
    description: 'DINARS créés EX NIHILO par la genèse d’e-cards (aucun solde débité) — depuis l’origine.',
  })
  genesisEcardsDt!: string;
  @ApiProperty({
    example: '5000.000',
    description: 'DINARS créés ex nihilo par genèse de SOLDE (ADMIN_GENESIS) — depuis l’origine.',
  })
  genesisBalanceDt!: string;
  @ApiProperty({
    example: '184300.000',
    description: 'DINARS versés en commissions depuis l’origine (runs en SUCCESS).',
  })
  commissionsPaidDt!: string;
}

export class TopAffiliateRowDto {
  @ApiProperty() memberId!: number;
  @ApiProperty() memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ nullable: true }) packName!: string | null;
  @ApiProperty({ example: '8400.000', description: 'DINARS perçus en commissions sur la période.' })
  paidDt!: string;
  @ApiProperty({ description: 'Règlements (un par run).' }) runCount!: number;
  @ApiProperty({ description: 'Équilibres à vie (D-032) — état courant, pas de la période.' })
  lifetimeBalanceCount!: number;
  @ApiProperty({ description: 'Points Fidélité détenus (3ᵉ unité).' }) rewardPoints!: number;
}

export class OrdersByContextRowDto {
  @ApiProperty({ enum: OrderContext }) context!: OrderContext;
  @ApiProperty() orderCount!: number;
  @ApiProperty({ example: '21000.000', description: 'DINARS encaissés.' }) totalDt!: string;
  @ApiProperty({ example: 10000, description: 'POINTS des paniers.' }) totalPoints!: number;
}

export class SalesReportDto {
  @ApiProperty({ type: [ProductSalesRowDto] }) products!: ProductSalesRowDto[];
  @ApiProperty({
    type: [OrdersByContextRowDto],
    description:
      'Rappel de lecture : en ACTIVATION, le montant encaissé est le prix du pack − acompte, pas la somme des prix du panier.',
  })
  byContext!: OrdersByContextRowDto[];
}
