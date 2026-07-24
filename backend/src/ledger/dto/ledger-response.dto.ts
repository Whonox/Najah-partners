import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerMovementType } from '@prisma/client';

/**
 * Miroirs de doc du grand livre (spec §8, D-028) : le plugin CLI `@nestjs/swagger`
 * n'introspecte pas les types Prisma, donc sans ces classes les routes sortent sans schéma et
 * le client TS des fronts retombe en `unknown` (patron `ProductResponseDto`).
 *
 * Le grand livre est le journal des SOLDES, donc des DINARS, et de rien d'autre : aucun champ
 * de ce fichier n'est en points. Tous les montants sont sérialisés en CHAÎNE à 3 décimales —
 * un montant qui traverse un flottant JSON peut revenir faux au millime près.
 */
export class LedgerEntryResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() memberId!: number;

  @ApiProperty({
    enum: LedgerMovementType,
    description:
      'Il n’existe PAS de valeur `ECARD_USE` (D-025) : consommer une e-card ne bouge aucun solde, donc n’écrit aucune ligne ici.',
  })
  type!: LedgerMovementType;

  @ApiProperty({
    example: '-100.000',
    description: 'DINARS, SIGNÉ : + crédit, − débit.',
  })
  amountDt!: string;

  @ApiProperty({
    example: '1150.500',
    description: 'DINARS — solde du membre APRÈS le mouvement.',
  })
  balanceAfterDt!: string;

  @ApiPropertyOptional({ nullable: true, description: 'E-card à l’origine du mouvement.' })
  ecardId!: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Run de commissions à l’origine du mouvement.' })
  commissionId!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Motif — OBLIGATOIRE pour un ADMIN_ADJUSTMENT.',
  })
  reason!: string | null;

  @ApiProperty() createdAt!: Date;
}

export class LedgerHistoryPageDto {
  @ApiProperty({ type: [LedgerEntryResponseDto] })
  items!: LedgerEntryResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class MemberBalanceResponseDto {
  @ApiProperty() memberId!: number;
  @ApiProperty({ example: '1250.500', description: 'DINARS — solde courant.' })
  balanceDt!: string;
}
