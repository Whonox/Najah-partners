import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EcardOrigin,
  EcardStatus,
  MembershipPaymentType,
  OrderContext,
} from '@prisma/client';

/**
 * Vue ADMIN d'une e-card (spec §7.2.9).
 *
 * ═══ CE DTO NE PORTE PAS DE CHAMP `code`, ET C'EST STRUCTUREL ═══
 * Un code d'e-card est de la VALEUR AU PORTEUR : le connaître suffit à la dépenser. Le masquer
 * côté front n'aurait rien protégé — il aurait circulé en clair dans la réponse HTTP, dans le
 * cache du navigateur, dans les outils de développement et dans les journaux du reverse-proxy.
 * Il est donc absent du CONTRAT : l'API admin ne le renvoie jamais, quelle que soit la route.
 * `EcardView` (portail affilié) le porte, lui, parce qu'un membre a besoin du code de SA carte —
 * d'où deux DTO distincts plutôt qu'un champ optionnel qu'on oublierait de retirer un jour.
 *
 * La recherche PAR code reste possible (l'admin le saisit) : on cherche une correspondance
 * exacte et on renvoie la carte SANS son code. Chercher n'est pas restituer.
 */
export class EcardAdminRowDto {
  @ApiProperty({ description: 'Identifiant technique — le seul désignateur affichable.' })
  id!: number;

  @ApiProperty({ example: '2100.000', description: 'DINARS — une e-card est de l’argent (D-028).' })
  valueDt!: string;

  @ApiProperty({ enum: EcardStatus }) status!: EcardStatus;

  @ApiProperty({
    enum: EcardOrigin,
    description:
      'MEMBER : la valeur a été débitée du solde du créateur. GENESIS : créée ex nihilo par un SUPER_ADMIN — personne n’est remboursé à son expiration.',
  })
  origin!: EcardOrigin;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Créateur — `null` si et seulement si l’origine est GENESIS.',
  })
  creatorMemberId!: number | null;
  @ApiPropertyOptional({ nullable: true }) creatorMemberCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) creatorName!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Bénéficiaire qui l’a consommée — `null` tant qu’elle n’est pas USED.',
  })
  userMemberId!: number | null;
  @ApiPropertyOptional({ nullable: true }) userMemberCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) userName!: string | null;

  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ nullable: true }) usedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, description: '`null` = illimité (paramètre à -1).' })
  expiresAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, description: 'Passage à EXPIRED / REVOKED.' })
  closedAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Commande réglée par cette carte (D-041) — exclusif avec l’adhésion.',
  })
  orderId!: number | null;
  @ApiPropertyOptional({ nullable: true, enum: OrderContext })
  orderContext!: OrderContext | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Paiement d’adhésion réglé par cette carte — exclusif avec la commande.',
  })
  membershipPaymentId!: number | null;
  @ApiPropertyOptional({ nullable: true, enum: MembershipPaymentType })
  membershipPaymentType!: MembershipPaymentType | null;
}

export class EcardAdminPageDto {
  @ApiProperty({ type: [EcardAdminRowDto] }) items!: EcardAdminRowDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({
    example: '12500.000',
    description: 'DINARS — somme des valeurs des cartes filtrées (pas seulement de la page).',
  })
  totalValueDt!: string;
}

/** Un mouvement de solde lié à la carte : sa création (débit), son remboursement (recrédit). */
export class EcardLedgerRowDto {
  @ApiProperty() id!: number;
  @ApiProperty() memberId!: number;
  @ApiProperty() type!: string;
  @ApiProperty({ example: '-2100.000', description: 'DINARS, signé.' }) amountDt!: string;
  @ApiProperty() createdAt!: Date;
}

export class EcardAdminDetailDto extends EcardAdminRowDto {
  @ApiProperty({
    type: [EcardLedgerRowDto],
    description:
      'Mouvements de solde liés. RAPPEL D-025 : la CONSOMMATION n’écrit rien ici — aucun solde ne bouge quand une carte paie. Seules la création et le remboursement apparaissent.',
  })
  ledgerEntries!: EcardLedgerRowDto[];
}

/**
 * Réponse de la GENÈSE, et le seul endroit de toute l'API admin où un code sort en clair.
 *
 * Pourquoi ici, et nulle part ailleurs : une carte de genèse n'a pas de créateur à qui demander
 * son code, et il n'existe aucun canal de transmission (pas d'e-mail, D-011). Sans cette
 * réponse, l'admin fabriquerait une carte que personne ne pourrait jamais dépenser. Le code est
 * donc rendu UNE fois, à celui qui vient de la créer, et n'est plus jamais consultable :
 * `GET /admin/ecards` et `GET /admin/ecards/:id` ne le portent pas.
 */
export class GenesisEcardResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty({
    example: 'HHD-7Z7-JJD-77D',
    description:
      'Le code EN CLAIR, rendu une seule fois. Ne jamais le journaliser, ni le stocker côté client.',
  })
  code!: string;
  @ApiProperty({ example: '2100.000' }) valueDt!: string;
  @ApiProperty({ enum: EcardStatus }) status!: EcardStatus;
  @ApiProperty({ enum: EcardOrigin }) origin!: EcardOrigin;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ nullable: true }) expiresAt!: Date | null;
}

/** Réponse d'une révocation ou d'une prolongation : l'état de la carte, sans son code. */
export class EcardAdminActionDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: '2100.000' }) valueDt!: string;
  @ApiProperty({ enum: EcardStatus }) status!: EcardStatus;
  @ApiProperty({ enum: EcardOrigin }) origin!: EcardOrigin;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ nullable: true }) usedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) expiresAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) closedAt!: Date | null;
}
