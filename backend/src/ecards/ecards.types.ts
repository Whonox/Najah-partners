import { EcardOrigin, EcardStatus } from '@prisma/client';
import { Money } from '../common/money';

/**
 * Vue d'une e-card renvoyée au membre (spec §7.1.3 : valeur, statut, dates).
 *
 * `valueDt` est une CHAÎNE à 3 décimales (`"2200.000"`) et non un `number` : JSON n'a que des
 * flottants, et un montant qui traverse un `double` peut revenir faux au millime près.
 */
export interface EcardView {
  id: number;
  code: string;
  valueDt: string;
  status: EcardStatus;
  origin: EcardOrigin;
  createdAt: Date;
  usedAt: Date | null;
  expiresAt: Date | null;
  closedAt: Date | null;
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

/** Consommation d'une e-card : ce que la transaction appelante a réellement brûlé (en DT). */
export interface ConsumedEcard {
  ecardId: number;
  valueDt: Money;
}

/** Bilan d'un passage du cron d'expiration. */
export interface ExpirationSweepResult {
  expired: number;
  /** Total recrédité aux créateurs, en DT (une e-card de genèse ne rembourse personne). */
  refundedDt: Money;
  /** E-cards échues mais consommées/révoquées entre le balayage et la transaction. */
  skipped: number;
}
