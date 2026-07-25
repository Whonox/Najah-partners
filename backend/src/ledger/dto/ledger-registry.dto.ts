import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerMovementType, MemberStatus } from '@prisma/client';

/**
 * Registre des soldes et journal GLOBAL des mouvements (spec §7.2.8). Complète les routes « par
 * membre » de la Tranche 5, qui ne répondaient qu'à « et lui, combien a-t-il ? » — pas à
 * « qu'est-ce qui a bougé cette semaine ? », qui est la question d'un contrôle comptable.
 *
 * Tout est en DINARS (D-028), en chaîne à 3 décimales. Les POINTS n'entrent jamais au grand
 * livre : ils ne sont pas un avoir.
 */

export class BalanceRowDto {
  @ApiProperty() memberId!: number;
  @ApiProperty() memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: MemberStatus }) status!: MemberStatus;
  @ApiProperty({ example: '1250.500', description: 'DINARS — solde courant.' })
  balanceDt!: string;
  @ApiProperty({ description: 'Mouvements enregistrés pour ce membre.' })
  movementCount!: number;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Date du dernier mouvement. `null` = aucun mouvement : un solde à 0 sans histoire, ce qui est le cas normal d’un INSCRIT (payer par e-card n’écrit RIEN au grand livre — D-025).',
  })
  lastMovementAt!: Date | null;
}

export class BalancePageDto {
  @ApiProperty({ type: [BalanceRowDto] }) items!: BalanceRowDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({
    example: '31200.500',
    description: 'DINARS — somme des soldes de TOUS les membres correspondant au filtre (pas seulement de la page).',
  })
  totalBalanceDt!: string;
}

export class MovementMemberRefDto {
  @ApiProperty() id!: number;
  @ApiProperty() memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

export class MovementRowDto {
  @ApiProperty() id!: number;
  @ApiProperty({ type: MovementMemberRefDto }) member!: MovementMemberRefDto;
  @ApiProperty({
    enum: LedgerMovementType,
    description:
      'Il n’existe PAS de `ECARD_USE` (D-025) : consommer une e-card ne bouge aucun solde, donc n’écrit rien ici.',
  })
  type!: LedgerMovementType;
  @ApiProperty({ example: '-100.000', description: 'DINARS, SIGNÉ : + crédit, − débit.' })
  amountDt!: string;
  @ApiProperty({ example: '1150.500', description: 'DINARS — solde APRÈS le mouvement.' })
  balanceAfterDt!: string;
  @ApiPropertyOptional({ nullable: true, description: 'E-card à l’origine du mouvement (id, jamais le code).' })
  ecardId!: number | null;
  @ApiPropertyOptional({ nullable: true }) commissionId!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Motif — OBLIGATOIRE pour un ajustement comme pour une genèse.',
  })
  reason!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class MovementPageDto {
  @ApiProperty({ type: [MovementRowDto] }) items!: MovementRowDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({
    example: '4300.000',
    description: 'DINARS — somme SIGNÉE des mouvements filtrés (pas seulement de la page).',
  })
  netAmountDt!: string;
}
