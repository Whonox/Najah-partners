import {
  IdDocumentType,
  Leg,
  MemberStatus,
  MembershipPaymentStatus,
  MembershipPaymentType,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import type { ActivationEventsSummary } from '../commissions/commission-events.service';
import { Money } from '../common/money';

/**
 * Pièce d'identité (D-018, D-039) : le fichier déjà validé et écrit sur disque (chemin
 * relatif) ET le numéro saisi à la main, que l'admin comparera à l'image. Informatif de bout
 * en bout — la vérification ne bloque JAMAIS ni l'inscription, ni l'activation.
 */
export interface StoredIdDocument {
  type: IdDocumentType;
  number: string;
  /**
   * Chemin du fichier déposé. OPTIONNEL depuis D-050/D-060 : à l'inscription, seuls le type
   * et le numéro sont saisis — l'IMAGE se dépose à la première connexion, sous identité
   * connue. Reste renseignable par les appelants internes (seed, tests) qui fournissent le
   * fichier d'un bloc.
   */
  relativePath?: string;
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
  /**
   * Codes des e-cards qui règlent les frais d'inscription (D-036). Leur somme doit valoir
   * EXACTEMENT le paramètre `registration_fee_dt` (100 DT). Sans elles, pas d'inscription —
   * plus rien ne se règle « en espèces hors système » à l'entrée du réseau.
   */
  ecardCodes: string[];
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
  /**
   * DINARS versés à l'inscription — l'ACOMPTE qui sera déduit du prix du pack à l'activation
   * (D-037). Renvoyé pour que le portail puisse annoncer le reste à payer sans le recalculer.
   */
  registrationPaidDt: string;
}

/** Comment le montant dû à l'activation a été réglé (D-025). Une seule voie à la fois. */
export interface SettlementResult {
  method: 'BALANCE' | 'ECARD';
  /** Débit ACTIVATION au grand livre — seulement si réglé sur le solde. */
  ledgerEntryId: number | null;
  /**
   * E-cards brûlées — seulement si réglé par e-card (aucun mouvement de solde, D-025).
   * Plusieurs depuis D-030 : leur somme couvre le montant dû exactement. Vide sinon.
   */
  ecardIds: number[];
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
 *   `priceDt` — DINARS : le TARIF du pack (D-029).
 * Les montants monétaires sont figés en CHAÎNE (`"2200.000"`) : le snapshot est stocké en JSON,
 * et un montant qui traverse un flottant peut revenir faux au millime près — un historique
 * qu'on prétend immuable ne peut pas se permettre d'être approximatif.
 *
 * DEPUIS D-037, le tarif n'est plus ce qui est encaissé : les frais d'inscription déjà versés
 * sont un ACOMPTE. On fige donc les trois nombres — tarif, acompte déduit, montant réellement
 * dû — plutôt que de laisser un lecteur futur refaire la soustraction avec un acompte qui
 * aura peut-être changé entre-temps.
 */
export interface ActivationSnapshot {
  packName: string;
  tierBv: number;
  /** DINARS — tarif du pack (2200 pour Silver). Ce n'est PAS ce qui a été encaissé. */
  priceDt: string;
  /** DINARS — acompte d'inscription déduit (D-037), tel que figé sur le membre. */
  registrationCreditDt: string;
  /** DINARS — ce que l'activation a réellement fait payer : `priceDt − registrationCreditDt`. */
  amountDueDt: string;
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
  /** Ancêtres crédités du palier (en POINTS), de l'upline direct jusqu'à la racine. */
  creditedAncestors: number;
  /** Événements de commission écrits au fil de l'eau par cette activation (D-035). */
  commissionEvents: ActivationEventsSummary;
  /** Comment le montant dû a été réglé (solde débité, ou e-cards brûlées — D-025). */
  payment: SettlementResult;
}

/** Ce qu'un paiement d'adhésion (inscription / renouvellement) renvoie à l'API. */
export interface MembershipPaymentView {
  id: number;
  memberId: number;
  memberCode: string;
  type: MembershipPaymentType;
  status: MembershipPaymentStatus;
  /** DINARS, en chaîne à 3 décimales (cf. money.ts). */
  amountDt: string;
  paidAt: Date;
  validatedAt: Date | null;
  /** Ids des e-cards brûlées — JAMAIS leurs codes (un code est de la valeur au porteur). */
  ecardIds: number[];
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
  /**
   * Le nœud a-t-il un downline gauche / droit — Y COMPRIS au-delà de la profondeur ramenée ?
   * C'est ce qui distingue une feuille RÉELLE d'une feuille tronquée par la borne : sans lui,
   * la généalogie devrait charger tout l'arbre pour savoir où l'on peut descendre.
   */
  hasLeftChild: boolean;
  hasRightChild: boolean;
}

/** Arbre imbriqué renvoyé par l'API (assemblé en mémoire depuis les lignes plates). */
export interface TreeNode extends TreeRow {
  left: TreeNode | null;
  right: TreeNode | null;
}
