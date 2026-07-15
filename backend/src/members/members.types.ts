import {
  IdDocumentType,
  Leg,
  MemberStatus,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import { Money } from '../common/money';

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

/** Comment le prix du pack a été réglé (D-025). Exactement un des deux identifiants est non nul. */
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
 * Contrat : `settleInTx` RÈGLE intégralement `amountDt` — le PRIX DU PACK en dinars (D-029) —
 * dans la transaction de l'appelant, ou lève. L'activation ne débite plus rien elle-même : la
 * manière dont l'argent est fourni appartient à la stratégie, pas à l'arbre.
 *
 * C'est ici que passe la frontière du modèle à deux dimensions (D-028) : la stratégie ne voit
 * que des DINARS (`amountDt`), l'arbre ne voit que des POINTS (`tierBv`). Les deux ne se
 * rencontrent jamais — on ne convertit rien, on paie un prix et on crédite un palier.
 *
 *  - `BalanceActivationPayment` : débite le solde du membre du prix du pack (mouvement ACTIVATION).
 *  - `EcardActivationPayment` (Tranche 5) : brûle une e-card de valeur EXACTEMENT égale au prix
 *    du pack. AUCUN mouvement de solde — l'e-card est un instrument de paiement consommé au
 *    point de transaction, pas une recharge (D-025). Créditer le bénéficiaire ici puis le
 *    débiter du prix serait un aller-retour net nul qui ferait transiter de l'argent par un
 *    solde qui n'a jamais eu à le porter.
 */
export interface ActivationPayment {
  settleInTx(
    tx: Prisma.TransactionClient,
    input: { memberId: number; amountDt: Money },
  ): Promise<SettlementResult>;
}

/**
 * Paramètres du pack figés au moment de l'activation (spec §5.8). Les DEUX dimensions y sont,
 * et elles ne se déduisent pas l'une de l'autre (D-028) :
 *   `tierBv`  — POINTS : ce que l'arbre a reçu, et ce que le panier devait totaliser ;
 *   `priceDt` — DINARS : ce que l'activation a fait payer (D-029).
 * Les montants monétaires sont figés en CHAÎNE (`"2200.000"`) : le snapshot est stocké en JSON,
 * et un montant qui traverse un flottant peut revenir faux au millime près — un historique
 * qu'on prétend immuable ne peut pas se permettre d'être approximatif.
 */
export interface ActivationSnapshot {
  packName: string;
  tierBv: number;
  priceDt: string;
  directCommissionDt: string;
  indirectCommissionDt: string;
  weeklyCapDt: string;
}

export interface ActivationResult {
  memberId: number;
  memberCode: string;
  packId: number;
  snapshot: ActivationSnapshot;
  baselineLeft: number;
  baselineRight: number;
  startupBonusRemaining: number;
  /** Ancêtres crédités du palier (en POINTS), de l'upline direct jusqu'à la racine. */
  creditedAncestors: number;
  /** Comment le prix du pack a été réglé (solde débité, ou e-card brûlée — D-025). */
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
