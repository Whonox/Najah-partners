import { EcardOrigin, EcardStatus } from '@prisma/client';

/** Vue d'une e-card renvoyée au membre (spec §7.1.3 : valeur, statut, dates). */
export interface EcardView {
  id: number;
  code: string;
  valueBv: number;
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
  valueBv: number;
  status: EcardStatus;
  expiresAt: Date | null;
  /** Renseigné si `valid` est faux : pourquoi la carte n'est pas utilisable. */
  reason: string | null;
}

/** Consommation d'une e-card : ce que la transaction appelante a réellement brûlé. */
export interface ConsumedEcard {
  ecardId: number;
  valueBv: number;
}

/** Bilan d'un passage du cron d'expiration. */
export interface ExpirationSweepResult {
  expired: number;
  refundedBv: number;
  /** E-cards échues mais consommées/révoquées entre le balayage et la transaction. */
  skipped: number;
}
