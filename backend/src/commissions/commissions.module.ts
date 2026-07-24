import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { CommissionEventsService } from './commission-events.service';
import { CommissionRunCron } from './commission-run.cron';
import { CommissionRunService } from './commission-run.service';

/**
 * Moteur de commissions (Tranche 7, D-035) — deux temps bien séparés :
 *  - `CommissionEventsService` (temps 1) : événements écrits au fil de l'eau, DANS la
 *    transaction d'activation — consommé par `MembersModule` (ActivationService) ;
 *  - `CommissionRunService` + cron (temps 2) : plafond + crédit hebdomadaires, via le
 *    grand livre (`LedgerModule`) — seul point d'écriture des soldes.
 * Aucune route HTTP ici : la supervision admin arrive en Tranche 8 (§7.2.7).
 */
@Module({
  imports: [LedgerModule],
  providers: [CommissionEventsService, CommissionRunService, CommissionRunCron],
  exports: [CommissionEventsService, CommissionRunService],
})
export class CommissionsModule {}
