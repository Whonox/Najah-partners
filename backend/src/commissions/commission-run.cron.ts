import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CommissionRunService } from './commission-run.service';

/**
 * Déclencheur HEBDOMADAIRE du run de commissions (D-009) : vendredi 23:59, heure de Tunis
 * (UTC+1 sans changement d'heure — la clôture est déterministe). Loin du cron des e-cards
 * (03:00) : les deux ne se disputent jamais les verrous de lignes `Member`.
 *
 * Le cron n'est qu'un déclencheur : toute la logique (et son idempotence) vit dans
 * `CommissionRunService`, appelable à la main pour un rattrapage (période explicite) et
 * testable sans horloge. Un déclenchement en retard traite exactement la même période —
 * les bornes sont calculées, jamais héritées de l'heure d'exécution.
 */
@Injectable()
export class CommissionRunCron {
  private readonly logger = new Logger(CommissionRunCron.name);

  constructor(private readonly runs: CommissionRunService) {}

  @Cron('59 23 * * 5', {
    name: 'commission-weekly-run',
    timeZone: 'Africa/Tunis',
  })
  async run(): Promise<void> {
    try {
      const result = await this.runs.runLatestClosedPeriod();
      if (result.alreadyExecuted) {
        this.logger.log(
          `Run ${result.runId} déjà exécuté pour la période close — rien à faire.`,
        );
      }
    } catch (error) {
      // Déjà tracé en base (run ERROR) par le service : on journalise sans re-lever,
      // un cron qui explose ne doit pas abattre le scheduler.
      this.logger.error(
        `Run hebdomadaire échoué : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
