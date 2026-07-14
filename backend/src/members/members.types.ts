import {
  IdDocumentType,
  Leg,
  MemberStatus,
  Prisma,
  VerificationStatus,
} from '@prisma/client';

/** Fichier de pièce d'identité déjà validé et écrit sur disque (chemin relatif). */
export interface StoredIdDocument {
  type: IdDocumentType;
  relativePath: string;
}

/** Entrée d'inscription (le contrôleur a déjà validé le DTO et stocké le fichier). */
export interface RegisterMemberInput {
  lastName: string;
  firstName: string;
  email?: string | null;
  phone?: string | null;
  password: string;
  sponsorCode: string;
  uplineCode: string;
  leg: Leg;
  idDocument?: StoredIdDocument;
}

/** Vue d'un membre renvoyée après inscription (aucune donnée sensible). */
export interface RegisteredMember {
  id: number;
  memberCode: string;
  lastName: string;
  firstName: string;
  status: MemberStatus;
  sponsorCode: string;
  uplineCode: string;
  leg: Leg;
  verificationStatus: VerificationStatus;
  registeredAt: Date;
}

/** Comment le palier a été réglé (D-025). Exactement un des deux identifiants est non nul. */
export interface SettlementResult {
  method: 'BALANCE' | 'ECARD';
  /** Débit ACTIVATION au grand livre — seulement si réglé sur le solde. */
  ledgerEntryId: number | null;
  /** E-card brûlée — seulement si réglé par e-card (aucun mouvement de solde, D-025). */
  ecardId: number | null;
}

/**
 * Moyen de paiement de l'activation — SEUL point d'extension entre l'arbre et l'argent.
 *
 * Contrat : `settleInTx` RÈGLE intégralement `amountBv` dans la transaction de l'appelant,
 * ou lève. L'activation ne débite plus rien elle-même : la manière dont la valeur est
 * fournie appartient à la stratégie, pas à l'arbre.
 *
 *  - `BalanceActivationPayment` : débite le solde du membre (mouvement ACTIVATION).
 *  - `EcardActivationPayment` (Tranche 5) : brûle une e-card de valeur EXACTEMENT égale au
 *    palier. AUCUN mouvement de solde — l'e-card est un instrument de paiement consommé au
 *    point de transaction, pas une recharge (D-025). Créditer le bénéficiaire ici puis le
 *    débiter du palier serait un aller-retour net nul qui ferait transiter du BV par un
 *    solde qui n'a jamais eu à le porter.
 */
export interface ActivationPayment {
  settleInTx(
    tx: Prisma.TransactionClient,
    input: { memberId: number; amountBv: number },
  ): Promise<SettlementResult>;
}

/** Paramètres du pack figés au moment de l'activation (spec §5.8). */
export interface ActivationSnapshot {
  packName: string;
  tierBv: number;
  directCommissionBv: number;
  indirectCommissionBv: number;
  weeklyCapBv: number;
}

export interface ActivationResult {
  memberId: number;
  memberCode: string;
  packId: number;
  snapshot: ActivationSnapshot;
  baselineLeft: number;
  baselineRight: number;
  startupBonusRemaining: number;
  /** Ancêtres crédités du palier, de l'upline direct jusqu'à la racine. */
  creditedAncestors: number;
  /** Comment le palier a été réglé (solde débité, ou e-card brûlée — D-025). */
  payment: SettlementResult;
}

/** Ligne plate renvoyée par la CTE descendante. */
export interface TreeRow {
  id: number;
  depth: number;
  memberCode: string;
  firstName: string;
  lastName: string;
  status: MemberStatus;
  leg: Leg | null;
  uplineId: number | null;
  packName: string | null;
  activatedAt: Date | null;
  leftPoints: number;
  rightPoints: number;
}

/** Arbre imbriqué renvoyé par l'API (assemblé en mémoire depuis les lignes plates). */
export interface TreeNode extends TreeRow {
  left: TreeNode | null;
  right: TreeNode | null;
}
