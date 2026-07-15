import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { moneyToApi } from '../common/money';
import { EcardsService } from './ecards.service';

/**
 * Balayage QUOTIDIEN des e-cards échues (D-008) : `ACTIVE` + échéance dépassée → `EXPIRED`,
 * valeur (en DT) recréditée au créateur.
 *
 * 03:00, heure de Tunis : creux d'activité, loin de la clôture des commissions du vendredi
 * 23:59 (§5.8) — les deux crons ne se disputent pas les verrous de lignes `Member`.
 *
 * Le cron n'est qu'un DÉCLENCHEUR : toute la logique (et son atomicité) vit dans
 * `EcardsService.expireDue`, qui reste appelable à la main et testable sans horloge. Une
 * e-card échue mais pas encore balayée est déjà refusée à la consommation (l'échéance fait
 * foi, pas le passage du cron) : un cron en retard ne laisse jamais payer avec une carte morte.
 */
@Injectable()
export class EcardExpirationCron {
  private readonly logger = new Logger(EcardExpirationCron.name);

  constructor(private readonly ecards: EcardsService) {}

  @Cron('0 3 * * *', {
    name: 'ecard-expiration',
    timeZone: 'Africa/Tunis',
  })
  async run(): Promise<void> {
    const result = await this.ecards.expireDue();
    if (result.expired > 0 || result.skipped > 0) {
      this.logger.log(
        `Expiration e-cards : ${result.expired} expirée(s), ${moneyToApi(result.refundedDt)} DT recrédité(s), ` +
          `${result.skipped} ignorée(s) (consommée(s) pendant le balayage).`,
      );
    }
  }
}
