import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

/** Pack ciblé inexistant. */
export class PackNotFoundError extends NotFoundException {
  constructor(packId: number) {
    super(`Pack ${packId} introuvable.`);
  }
}

/** `Pack.name` est unique en base : deux « Silver » rendraient l'historique illisible. */
export class PackNameTakenError extends ConflictException {
  constructor(name: string) {
    super(`Un pack nommé « ${name} » existe déjà.`);
  }
}

/**
 * Plafond hebdomadaire inférieur à une commission unitaire (spec §7.2.4).
 *
 * Ce n'est pas un caprice de validation : le plafond s'applique en chronologie stricte
 * (D-033), et l'événement qui le franchit est payé PARTIELLEMENT — tout le reste de la
 * semaine étant perdu. Un plafond sous la commission directe signifierait qu'AUCUNE
 * commission de ce pack ne peut jamais être versée en entier, pas même la première de la
 * semaine. C'est un plan de rémunération qui ne rémunère pas.
 */
export class WeeklyCapBelowCommissionError extends BadRequestException {
  constructor(capDt: string, commissionDt: string, which: 'directe' | 'indirecte') {
    super(
      `Plafond hebdomadaire (${capDt} DT) inférieur à la commission ${which} (${commissionDt} DT) : ` +
        'aucune commission de ce pack ne pourrait jamais être versée en entier.',
    );
  }
}
