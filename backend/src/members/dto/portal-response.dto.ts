import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IdDocumentType,
  Leg,
  MemberStatus,
  MembershipPaymentStatus,
  VerificationStatus,
} from '@prisma/client';

/**
 * Surface AFFILIÉ (spec §7.1). Ce fichier ne décrit QUE ce qu'un membre voit de LUI-MÊME :
 * aucune route de ce contrat n'accepte d'identifiant de membre en paramètre — la portée vient
 * du token, jamais de l'URL. Un membre ne peut donc pas demander les données d'un autre, même
 * en forçant une requête.
 *
 * DEUX DIMENSIONS, JAMAIS MÉLANGÉES (D-028) : les champs en `…Dt` sont des DINARS, sérialisés
 * en CHAÎNE à 3 décimales (un montant qui traverse un flottant JSON revient faux au millime) ;
 * les champs en `…Points` / `…Bv` sont des POINTS, des entiers. Aucune conversion n'existe. Les
 * Points Fidélité (`rewardPoints`) sont une TROISIÈME unité, ni l'une ni l'autre (D-032).
 */

/** Un membre tel qu'il s'identifie auprès d'un autre : par son code, jamais par son id. */
export class MemberLinkDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'NP000042' }) memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

/**
 * Le pack tel qu'il a été FIGÉ à l'activation (§5.8) — jamais le pack vivant. Modifier un pack
 * demain ne réécrit pas ce que ce membre a acheté, ni ce que le moteur lui applique.
 */
export class MemberPackSnapshotDto {
  @ApiProperty({ example: 'Silver' }) packName!: string;
  @ApiProperty({
    example: 1000,
    description: 'POINTS — le palier, injecté entier dans l’arbre.',
  })
  tierBv!: number;

  // ─────────────────────────────────────────────────────────────────────────────────────
  // Les quatre montants ci-dessous sont NULLABLES, et ce n'est pas de la prudence gratuite :
  // les activations ANTÉRIEURES à la Tranche 6.5 ont figé un snapshot dont les montants
  // étaient exprimés en points (`weeklyCapBv`…) et non en dinars. Ces lignes existent encore
  // — c'est la vérité historique, et la réécrire violerait l'invariant de snapshot.
  //
  // Rendre `0.000` pour un montant ABSENT affirmerait « votre plafond est nul », ce qui est
  // faux et alarmant ; `null` dit « cette donnée n'existe pas pour vous », ce qui est exact.
  // L'écran rend alors « — ». La distinction se perd au premier `?? 0` : elle est donc portée
  // par le TYPE, pas par une convention.
  // ─────────────────────────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    nullable: true,
    example: '2200.000',
    description:
      'DINARS — prix du pack. `null` pour une activation antérieure à D-028.',
  })
  priceDt!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '500.000',
    description: 'DINARS — commission directe, par filleul activé.',
  })
  directCommissionDt!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '250.000',
    description: 'DINARS — commission indirecte, par équilibre.',
  })
  indirectCommissionDt!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '10000.000',
    description:
      'DINARS — plafond HEBDOMADAIRE. Au-delà, l’argent de la semaine est PERDU, jamais reporté (D-033).',
  })
  weeklyCapDt!: string | null;
}

/** Vérification d'identité (D-018) — informative, elle ne bloque RIEN. */
export class MemberVerificationDto {
  @ApiProperty({ enum: VerificationStatus }) status!: VerificationStatus;
  @ApiPropertyOptional({ nullable: true, enum: IdDocumentType })
  documentType!: IdDocumentType | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Numéro saisi à l’inscription (D-039).',
  })
  documentNumber!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Motif — renseigné uniquement en cas de REJECTED.',
  })
  reason!: string | null;
  @ApiPropertyOptional({ nullable: true }) decidedAt!: Date | null;
}

/** Où en est mon renouvellement annuel (D-038 : payer ne dégèle pas — l'admin valide). */
export class MemberRenewalStateDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Échéance courante. `null` tant que le membre n’a jamais été activé.',
  })
  renewalAt!: Date | null;

  @ApiProperty({
    example: '100.000',
    description:
      'DINARS — montant du PROCHAIN renouvellement, tel que le paramètre le fixe AUJOURD’HUI. ' +
      'Sans lui, le portail ne pourrait pas dire quelle somme d’e-cards composer (le montant ' +
      'exact est exigé — D-030). Il ne réécrit rien : chaque paiement fige le sien ' +
      '(`amountDt`), et changer le tarif demain ne touche aucun versement passé.',
  })
  amountDueDt!: string;

  @ApiPropertyOptional({
    nullable: true,
    enum: MembershipPaymentStatus,
    description:
      'État du DERNIER paiement de renouvellement. PENDING_VALIDATION = payé, en attente de l’administration : le membre gelé le reste et ne perçoit toujours rien.',
  })
  lastPaymentStatus!: MembershipPaymentStatus | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '100.000',
    description: 'DINARS — montant figé au paiement.',
  })
  lastPaymentAmountDt!: string | null;

  @ApiPropertyOptional({ nullable: true }) lastPaymentAt!: Date | null;
}

/** Mon profil (spec §7.1.7). Aucune donnée bancaire n'existe nulle part : pas de KYC financier. */
export class MemberProfileDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'NP000042' }) memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'IDENTIFIANT DE CONNEXION — non modifiable par le membre (D-049) : aucun canal de confirmation n’existe (D-011), une saisie erronée coûterait l’accès au compte. La correction passe par l’administration.',
  })
  email!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'IDENTIFIANT DE CONNEXION — non modifiable par le membre (D-049), comme l’e-mail.',
  })
  phone!: string | null;

  @ApiProperty({
    enum: MemberStatus,
    description:
      'REGISTERED : inscrit, place définitive, aucun point ni commission tant qu’il n’a pas activé. ACTIVE. INACTIVE : gelé faute de renouvellement (D-034) — ses points continuent de traverser l’arbre, mais il ne perçoit plus rien.',
  })
  status!: MemberStatus;

  @ApiProperty() registeredAt!: Date;
  @ApiPropertyOptional({ nullable: true }) activatedAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    type: MemberPackSnapshotDto,
    description: '`null` tant que le membre n’a pas activé.',
  })
  pack!: MemberPackSnapshotDto | null;

  @ApiPropertyOptional({
    nullable: true,
    type: MemberLinkDto,
    description:
      'SPONSOR (parrain) : qui m’a référé → déclenche SA commission directe. À ne pas confondre avec l’upline de placement.',
  })
  sponsor!: MemberLinkDto | null;

  @ApiPropertyOptional({
    nullable: true,
    type: MemberLinkDto,
    description:
      'UPLINE DE PLACEMENT : sous qui je suis rattaché dans l’arbre → déclenche le binaire. Peut être un autre membre que le sponsor. Immuable depuis l’inscription.',
  })
  upline!: MemberLinkDto | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: Leg,
    description: 'Ma jambe sous mon upline de placement.',
  })
  leg!: Leg | null;

  @ApiProperty({
    example: '100.000',
    description:
      'DINARS — frais d’inscription réellement versés, figés (D-036). C’est l’ACOMPTE déduit du prix du pack à l’activation (D-037).',
  })
  registrationPaidDt!: string;

  @ApiProperty({ type: MemberVerificationDto })
  verification!: MemberVerificationDto;

  @ApiProperty({ type: MemberRenewalStateDto })
  renewal!: MemberRenewalStateDto;

  @ApiProperty({
    description:
      'Parcours de première connexion terminé (D-050). C’est la SEULE information dont le ' +
      'portail a besoin au démarrage pour décider s’il ouvre l’espace membre ou le parcours ' +
      'd’accueil — d’où sa présence ici plutôt qu’un second appel. À `false`, toutes les ' +
      'autres routes membre répondent 403 `ONBOARDING_REQUIRED` (D-057). ' +
      'À NE PAS CONFONDRE avec `verification`, qui elle ne bloque RIEN (D-018).',
  })
  onboardingCompleted!: boolean;
}

/** Le dernier run qui m'a réglé quelque chose. */
export class MemberLastRunDto {
  @ApiProperty() runId!: number;
  @ApiProperty({
    description: 'Clôture de la semaine du moteur (vendredi 23:59 Tunis).',
  })
  periodEnd!: Date;
  @ApiProperty({
    example: '750.000',
    description: 'DINARS — dû brut de la semaine.',
  })
  grossDt!: string;
  @ApiProperty({
    example: '750.000',
    description: 'DINARS — réellement versé.',
  })
  paidDt!: string;
  @ApiProperty({
    example: '0.000',
    description: 'DINARS — PERDU au plafond (jamais reporté, D-033).',
  })
  lostDt!: string;
  @ApiProperty({
    description: 'Points Fidélité obtenus sur ce run (3ᵉ unité — D-032).',
  })
  rewardPointsGranted!: number;
}

/**
 * Tableau de bord de l'affilié (spec §7.1.1). AUCUN calcul de règle ici : chaque chiffre est
 * lu tel qu'il a été écrit par une activation, un run ou un paiement. Le portail affiche et
 * déclenche ; le backend décide.
 */
export class MemberDashboardDto {
  // ── L'argent (DINARS) ──
  @ApiProperty({
    example: '1250.500',
    description: 'DINARS — mon solde courant.',
  })
  balanceDt!: string;

  @ApiProperty({
    example: '4300.000',
    description:
      'DINARS — total des commissions RÉELLEMENT PERÇUES depuis toujours (Σ des runs).',
  })
  lifetimeEarnedDt!: string;

  @ApiPropertyOptional({ nullable: true, type: MemberLastRunDto })
  lastRun!: MemberLastRunDto | null;

  @ApiProperty({
    example: '500.000',
    description:
      'DINARS — dû BRUT en attente du prochain run (événements éligibles pas encore réclamés). Le plafond ne s’applique qu’au run : ce montant n’est donc pas une promesse de versement.',
  })
  pendingGrossDt!: string;

  @ApiProperty({
    description:
      'Nombre d’événements de commission en attente du prochain run.',
  })
  pendingEventCount!: number;

  @ApiProperty({
    description: 'Clôture du PROCHAIN run (vendredi 23:59, Tunis — D-009).',
  })
  nextRunAt!: Date;

  // ── L'arbre (POINTS) ──
  @ApiProperty({
    example: 3000,
    description: 'POINTS — cumul À VIE reçu sur ma jambe GAUCHE.',
  })
  leftPoints!: number;
  @ApiProperty({
    example: 2000,
    description: 'POINTS — cumul À VIE reçu sur ma jambe DROITE.',
  })
  rightPoints!: number;

  @ApiProperty({
    example: 1000,
    description:
      'POINTS — carry-over GAUCHE : points pas encore appariés, en réserve SANS ÉCHÉANCE. Jamais perdus (à ne pas confondre avec l’argent au-delà du plafond, lui perdu).',
  })
  carriedLeftPoints!: number;
  @ApiProperty({
    example: 0,
    description: 'POINTS — carry-over DROIT, même règle.',
  })
  carriedRightPoints!: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 1000,
    description:
      'POINTS — mon palier, FIGÉ à l’activation. C’est lui qui définit combien de points font un équilibre. `null` tant que je n’ai pas activé.',
  })
  tierBv!: number | null;

  // ── Le moteur ──
  @ApiProperty({
    description:
      'Nombre d’équilibres À VIE, jamais remis à zéro (bonus de démarrage compris — D-032).',
  })
  lifetimeBalanceCount!: number;

  @ApiProperty({
    description:
      'Points Fidélité — TROISIÈME unité (ni points BV, ni dinars) : 1 par équilibre dont l’index à vie est un multiple de 6 (D-032).',
  })
  rewardPoints!: number;

  @ApiProperty({
    description:
      'Bonus de démarrage déjà consommé — une seule fois à vie (D-031).',
  })
  startupBonusUsed!: boolean;

  // ── Le réseau ──
  @ApiProperty({
    description: 'Membres dans mon sous-arbre, tous états confondus.',
  })
  downlineCount!: number;
  @ApiProperty({
    description:
      'Parmi eux, ceux qui ont ACTIVÉ (seuls ceux-là ont injecté des points).',
  })
  activatedDownlineCount!: number;
  @ApiProperty({
    description: 'Filleuls que j’ai PARRAINÉS (sponsoring ≠ placement).',
  })
  referralCount!: number;

  // ── Mes e-cards ──
  @ApiProperty({ description: 'Mes e-cards encore ACTIVE.' })
  activeEcardCount!: number;
  @ApiProperty({
    example: '450.000',
    description:
      'DINARS — valeur totale de mes e-cards actives (argent sorti de mon solde).',
  })
  activeEcardValueDt!: string;

  // ── Mon état ──
  @ApiProperty({ enum: MemberStatus }) status!: MemberStatus;
  @ApiPropertyOptional({ nullable: true, example: 'Silver' }) packName!:
    string | null;
  @ApiProperty({ type: MemberRenewalStateDto }) renewal!: MemberRenewalStateDto;
  @ApiPropertyOptional({
    nullable: true,
    example: '10000.000',
    description: 'DINARS — mon plafond hebdomadaire, figé à l’activation.',
  })
  weeklyCapDt!: string | null;
}

/**
 * Une ligne de la liste des downlines (spec §7.1.6).
 *
 * NE PORTE NI E-MAIL, NI TÉLÉPHONE, NI SOLDE : voir le sous-arbre de quelqu'un ne donne aucun
 * droit sur ses coordonnées ni sur son argent. Ce qui est légitime, c'est ce qui touche À MON
 * ARBRE : sa position, son état, et les points qu'il y a injectés.
 */
export class DownlineRowDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'NP000108' }) memberCode!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: MemberStatus }) status!: MemberStatus;

  @ApiPropertyOptional({ nullable: true, example: 'Gold' })
  packName!: string | null;

  @ApiProperty({ description: 'Profondeur sous moi : 1 = mon enfant direct.' })
  depth!: number;

  @ApiProperty({
    enum: Leg,
    description:
      'DE QUEL CÔTÉ DE MOI il se trouve — la jambe par laquelle ses points me sont arrivés.',
  })
  rootLeg!: Leg;

  @ApiPropertyOptional({
    nullable: true,
    enum: Leg,
    description: 'Sa jambe sous SON PROPRE upline (position locale).',
  })
  leg!: Leg | null;

  @ApiPropertyOptional({ nullable: true }) activatedAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 1000,
    description:
      'POINTS apportés à ma jambe : son palier, FIGÉ à son activation. `null` s’il n’a pas encore activé — il n’a alors rien injecté (D-005).',
  })
  contributedPoints!: number | null;

  @ApiProperty({
    description:
      'Est-ce un de MES filleuls (parrainage direct) ? Distinct de la position dans l’arbre.',
  })
  isDirectReferral!: boolean;
}

export class DownlinePageDto {
  @ApiProperty({ type: [DownlineRowDto] }) items!: DownlineRowDto[];
  @ApiProperty({
    description: 'Total FILTRÉ (pas la taille du sous-arbre entier).',
  })
  total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
