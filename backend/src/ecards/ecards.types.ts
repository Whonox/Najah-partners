import { EcardOrigin, EcardStatus } from '@prisma/client';
import { Money } from '../common/money';

/**
 * Vue d'une e-card renvoyée au membre (spec §7.1.3 : valeur, statut, dates).
 *
 * ═══ CE TYPE NE PORTE PAS DE CHAMP `code`, ET C'EST STRUCTUREL (D-048) ═══
 * Un code d'e-card est de la VALEUR AU PORTEUR : le connaître suffit à la dépenser. Il n'est
 * donc restitué qu'UNE FOIS, à l'instant de la création, par `CreatedEcardView` — jamais par
 * une liste, une prolongation ou une révocation, qui sont rejouables à volonté. Le masquer
 * côté front n'aurait rien protégé : il aurait circulé en clair dans la réponse HTTP, dans le
 * cache du navigateur et dans les journaux du reverse-proxy. Même geste que `EcardAdminRowDto`
 * côté admin (D-045) : l'oubli devient impossible à COMPILER, pas seulement déconseillé.
 *
 * `valueDt` est une CHAÎNE à 3 décimales (`"2200.000"`) et non un `number` : JSON n'a que des
 * flottants, et un montant qui traverse un `double` peut revenir faux au millime près.
 */
export interface EcardView {
  id: number;
  valueDt: string;
  status: EcardStatus;
  origin: EcardOrigin;
  createdAt: Date;
  usedAt: Date | null;
  expiresAt: Date | null;
  closedAt: Date | null;
}

/**
 * La SEULE vue qui porte le code en clair : celle rendue à qui vient de créer la carte
 * (membre — `create`) ou de la faire naître ex nihilo (SUPER_ADMIN — `genesis`).
 *
 * Pourquoi une seule fois : il n'existe aucun canal de transmission (pas d'e-mail, D-011). Sans
 * cette réponse, on fabriquerait une carte que personne ne pourrait jamais dépenser. Passé cet
 * instant, le code n'est plus consultable nulle part — c'est au porteur de le conserver, comme
 * un billet.
 */
export interface CreatedEcardView extends EcardView {
  code: string;
}

/**
 * Réponse de la vérification d'un code (spec §7.1.3) : validité + valeur, SANS consommer.
 * Ne révèle ni le créateur ni le bénéficiaire — le porteur d'un code n'a pas à savoir qui
 * l'a émise ni qui d'autre y a touché.
 */
export interface EcardVerification {
  valid: boolean;
  valueDt: string;
  status: EcardStatus;
  expiresAt: Date | null;
  /** Renseigné si `valid` est faux : pourquoi la carte n'est pas utilisable. */
  reason: string | null;
}

/**
 * Consommation d'un LOT d'e-cards (D-030 : cumulables sur un même paiement) : ce que la
 * transaction appelante a réellement brûlé, en DT. `ecardIds` est trié par id croissant —
 * c'est l'ordre dans lequel les cartes ont été verrouillées (D-024).
 */
export interface ConsumedEcards {
  ecardIds: number[];
  /** Somme des valeurs brûlées : égale, au millime, au montant dû. */
  totalDt: Money;
}

/** Bilan d'un passage du cron d'expiration. */
export interface ExpirationSweepResult {
  expired: number;
  /** Total recrédité aux créateurs, en DT (une e-card de genèse ne rembourse personne). */
  refundedDt: Money;
  /** E-cards échues mais consommées/révoquées entre le balayage et la transaction. */
  skipped: number;
}
