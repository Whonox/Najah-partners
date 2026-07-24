import { InternalServerErrorException } from '@nestjs/common';

/**
 * Erreurs du moteur de commissions (Tranche 7). Toutes celles du temps 1 sont des erreurs
 * INTERNES : elles signalent une corruption — et lever, c'est annuler l'activation entière
 * (D-027) plutôt que committer une comptabilité fausse.
 */

/** Un membre ACTIF sans snapshot d'activation lisible : la donnée est corrompue. */
export class CorruptActivationSnapshotError extends InternalServerErrorException {
  constructor(memberId: number) {
    super(
      `Snapshot d'activation absent ou illisible pour le membre ACTIF ${memberId} : ` +
        'aucun événement de commission ne peut être écrit — transaction annulée.',
    );
  }
}

/**
 * La consommation de points n'a pas touché le nombre d'ancêtres attendu. Comme pour la
 * propagation tronquée (T4) : committer un état partiel serait une corruption irréversible.
 */
export class EventConsumptionMismatchError extends InternalServerErrorException {
  constructor(updated: number, expected: number) {
    super(
      `Consommation de points incohérente : ${updated} ancêtre(s) mis à jour pour ` +
        `${expected} attendu(s) — transaction annulée.`,
    );
  }
}
