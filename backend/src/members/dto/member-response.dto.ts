import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IdDocumentType,
  Leg,
  MemberStatus,
  VerificationStatus,
} from '@prisma/client';

/**
 * Vues admin d'un membre (spec §7.2.2). Miroirs de doc explicites : le plugin CLI
 * `@nestjs/swagger` n'introspecte pas les types Prisma, donc sans ces classes les endpoints
 * sortiraient sans schéma et le client TS des fronts retomberait en `unknown` (patron
 * `ProductResponseDto` / `SettingResponseDto`).
 *
 * DEUX RÈGLES tiennent tout ce fichier :
 *
 *  1. **Les deux dimensions ne se croisent jamais (D-028).** Les champs en `…Points` / `…Bv`
 *     sont des POINTS, des entiers `number`. Les champs en `…Dt` sont des DINARS, sérialisés
 *     en CHAÎNE à 3 décimales (`Prisma.Decimal#toJSON`) : JSON n'a que des flottants, et un
 *     solde qui traverse un `double` peut revenir faux au millime près.
 *  2. **Liste blanche, jamais la ligne Prisma.** Ni `passwordHash`, ni `idDocumentPath` (le
 *     chemin du fichier est une donnée d'infrastructure : le document se sert par sa route
 *     dédiée, pas en devinant un chemin).
 */

/** Référence courte vers un autre membre : de quoi afficher et cliquer, rien de plus. */
export class MemberRefDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'NP000042' }) memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: MemberStatus }) status!: MemberStatus;
}

export class MemberListItemDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'NP000042' }) memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: MemberStatus }) status!: MemberStatus;

  @ApiPropertyOptional({ nullable: true, description: 'Pack d’activation.' })
  packName!: string | null;

  @ApiProperty({
    example: '1250.500',
    description: 'DINARS — solde courant, sérialisé en string.',
  })
  balanceDt!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Downline de la jambe GAUCHE — null si la position est libre.',
    type: () => MemberRefDto,
  })
  leftDownline!: MemberRefDto | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Downline de la jambe DROITE — null si la position est libre.',
    type: () => MemberRefDto,
  })
  rightDownline!: MemberRefDto | null;

  @ApiProperty() registeredAt!: Date;

  @ApiPropertyOptional({
    nullable: true,
    description: 'null tant que le membre est INSCRIT.',
  })
  activatedAt!: Date | null;

  @ApiProperty({
    enum: VerificationStatus,
    description:
      'Vérification d’identité (D-018) — INFORMATIF : ne bloque ni l’inscription, ni l’activation, ni les commissions.',
  })
  verificationStatus!: VerificationStatus;
}

export class MemberPageDto {
  @ApiProperty({ type: [MemberListItemDto] }) items!: MemberListItemDto[];
  @ApiProperty({ description: 'Nombre total de membres correspondant au filtre.' })
  total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

/**
 * Snapshot d'activation (spec §5.8) tel qu'il a été FIGÉ. Le back-office l'affiche pour
 * expliquer un historique — il ne le recalcule jamais depuis le `Pack` vivant, qui a pu
 * changer depuis.
 */
/**
 * Le snapshot d'activation est du JSON figé : sa forme est celle qui avait cours LE JOUR de
 * l'activation, pas celle du code d'aujourd'hui. Les activations antérieures à D-028 ont figé
 * un plan de rémunération en `…Bv` et n'ont JAMAIS porté de prix, d'acompte ni de montant dû —
 * ces clés n'existaient pas encore.
 *
 * D'où des champs TOUS NULLABLES. Deux choses qu'on se refuse à faire :
 *  — convertir un `weeklyCapBv: 10000` d'avant D-028 en `weeklyCapDt: "10000.000"` : ce serait
 *    exactement la conversion points↔dinars que le modèle interdit ;
 *  — reconstruire un prix à partir du pack courant : le snapshot vaut précisément parce qu'il
 *    ne bouge pas quand le pack change.
 * Un montant que l'histoire n'a pas enregistré sort `null` et s'affiche « — ». C'est une
 * information juste ; un nombre inventé n'en serait pas une.
 */
export class ActivationSnapshotDto {
  @ApiPropertyOptional({ nullable: true }) packName!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    example: 1000,
    description: 'POINTS — palier injecté dans l’arbre.',
  })
  tierBv!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    example: '2200.000',
    description: 'DINARS — tarif du pack (D-029). null avant D-028 : jamais figé.',
  })
  priceDt!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    example: '100.000',
    description: 'DINARS — acompte d’inscription déduit (D-037). null avant D-037.',
  })
  registrationCreditDt!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    example: '2100.000',
    description: 'DINARS — ce que l’activation a réellement fait payer.',
  })
  amountDueDt!: string | null;
  @ApiPropertyOptional({ nullable: true, example: '500.000' })
  directCommissionDt!: string | null;
  @ApiPropertyOptional({ nullable: true, example: '250.000' })
  indirectCommissionDt!: string | null;
  @ApiPropertyOptional({ nullable: true, example: '10000.000' })
  weeklyCapDt!: string | null;
}

export class MemberDetailDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'NP000042' }) memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiProperty({ enum: MemberStatus }) status!: MemberStatus;

  @ApiProperty() registeredAt!: Date;
  @ApiPropertyOptional({ nullable: true }) activatedAt!: Date | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Échéance du renouvellement annuel (D-038).',
  })
  renewalAt!: Date | null;

  // ── Identité (D-018, D-039) — jamais bloquante ──
  @ApiPropertyOptional({ enum: IdDocumentType, nullable: true })
  idDocumentType!: IdDocumentType | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Numéro SAISI À LA MAIN par le membre : l’admin le compare à l’image.',
  })
  idDocumentNumber!: string | null;
  @ApiProperty({
    description:
      'Un document a été déposé — son image se lit sur GET /admin/members/{id}/id-document. Le chemin de stockage n’est jamais exposé.',
  })
  hasIdDocument!: boolean;
  @ApiProperty({ enum: VerificationStatus }) verificationStatus!: VerificationStatus;

  // ── Pack et snapshot ──
  @ApiPropertyOptional({ nullable: true }) packId!: number | null;
  @ApiPropertyOptional({ nullable: true }) packName!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    example: 1000,
    description: 'POINTS — palier figé à l’activation, celui que l’arbre a reçu.',
  })
  activationTierBv!: number | null;
  @ApiPropertyOptional({ nullable: true, type: () => ActivationSnapshotDto })
  activationSnapshot!: ActivationSnapshotDto | null;

  // ── Position dans l'arbre : DEUX liens distincts, jamais confondus ──
  @ApiPropertyOptional({
    nullable: true,
    type: () => MemberRefDto,
    description: 'SPONSOR (parrain) — déclenche la commission DIRECTE. Rien à voir avec l’upline.',
  })
  sponsor!: MemberRefDto | null;
  @ApiPropertyOptional({
    nullable: true,
    type: () => MemberRefDto,
    description:
      'UPLINE DE PLACEMENT — position dans l’arbre binaire, déclenche le BINAIRE. Immuable (D-023).',
  })
  upline!: MemberRefDto | null;
  @ApiPropertyOptional({
    enum: Leg,
    nullable: true,
    description: 'Jambe occupée SOUS l’upline de placement.',
  })
  leg!: Leg | null;
  @ApiPropertyOptional({ nullable: true, type: () => MemberRefDto })
  leftDownline!: MemberRefDto | null;
  @ApiPropertyOptional({ nullable: true, type: () => MemberRefDto })
  rightDownline!: MemberRefDto | null;

  // ── POINTS (l'arbre) — entiers, sans aucune valeur monétaire ──
  @ApiProperty({ description: 'POINTS — cumul À VIE de la jambe gauche (D-020).' })
  leftPoints!: number;
  @ApiProperty({ description: 'POINTS — cumul À VIE de la jambe droite (D-020).' })
  rightPoints!: number;
  @ApiProperty({
    description:
      'POINTS — baseline gauche figée à l’activation et à chaque réactivation (D-034). Documentaire (audit).',
  })
  baselineLeft!: number;
  @ApiProperty({ description: 'POINTS — baseline droite (idem).' })
  baselineRight!: number;
  @ApiProperty({
    description:
      'POINTS — pool appariable gauche = CARRY-OVER courant (D-035). Jamais perdu, sans échéance.',
  })
  carriedLeftPoints!: number;
  @ApiProperty({ description: 'POINTS — pool appariable droite (idem).' })
  carriedRightPoints!: number;

  // ── DINARS (le portefeuille) ──
  @ApiProperty({ example: '1250.500', description: 'DINARS — solde courant.' })
  balanceDt!: string;
  @ApiProperty({
    example: '100.000',
    description:
      'DINARS — frais d’inscription réellement versés, figés (D-036). C’est l’acompte déduit du prix du pack à l’activation (D-037).',
  })
  registrationPaidDt!: string;

  // ── Compteurs du moteur de commissions ──
  @ApiProperty({
    description: 'Nombre d’équilibres À VIE, jamais remis à zéro (D-032). Bonus inclus.',
  })
  lifetimeBalanceCount!: number;
  @ApiProperty({ description: 'Bonus de démarrage déjà consommé — une seule fois à vie (D-031).' })
  startupBonusUsed!: boolean;
  @ApiProperty({
    description:
      'Points Fidélité — TROISIÈME unité (D-032) : ni points BV, ni dinars. 1 par 6ᵉ équilibre.',
  })
  rewardPoints!: number;
  @ApiProperty({ description: 'Membres ACTIVÉS dans le sous-arbre (déclencheur du bonus, D-031).' })
  activatedDescendants!: number;
}
