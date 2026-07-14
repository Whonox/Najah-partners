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

/**
 * Moyen de paiement de l'activation — SEUL point d'extension entre l'arbre et l'argent.
 *
 * Contrat : à la sortie de `settleInTx`, le solde BV du membre doit couvrir `amountBv`.
 * L'activation débite ensuite ce montant (mouvement ACTIVATION) : si le solde ne suffit
 * pas, le grand livre lève `InsufficientBalanceError` et toute la transaction est annulée.
 *
 *  - Tranche 4 : `BalanceActivationPayment` — le solde doit déjà être approvisionné.
 *  - Tranche 5 : implémentation e-card — brûle la carte et crédite ECARD_USE dans la
 *    MÊME transaction (crédit +palier puis débit −palier : net nul, deux lignes tracées).
 */
export interface ActivationPayment {
  settleInTx(
    tx: Prisma.TransactionClient,
    input: { memberId: number; amountBv: number },
  ): Promise<void>;
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
  ledgerEntryId: number;
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
