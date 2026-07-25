import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { CommissionEventsService } from './commission-events.service';
import { CommissionRunCron } from './commission-run.cron';
import { CommissionRunService } from './commission-run.service';
import { CommissionsAdminController } from './commissions-admin.controller';
import { CommissionsAdminService } from './commissions-admin.service';

/**
 * Moteur de commissions (Tranche 7, D-035) — deux temps bien séparés :
 *  - `CommissionEventsService` (temps 1) : événements écrits au fil de l'eau, DANS la
 *    transaction d'activation — consommé par `MembersModule` (ActivationService) ;
 *  - `CommissionRunService` + cron (temps 2) : plafond + crédit hebdomadaires, via le
 *    grand livre (`LedgerModule`) — seul point d'écriture des soldes.
 *
 * Depuis la Tranche 8c s'y ajoute la SUPERVISION (§7.2.7) : `CommissionsAdminService` lit les
 * runs et rejoue `settleWeek` pour EXPLIQUER un versement, sans jamais rien écrire. La seule
 * route d'écriture du module est la relance de secours (SUPER_ADMIN), qui délègue au service de
 * run existant — donc à son idempotence.
 */
@Module({
  imports: [LedgerModule],
  controllers: [CommissionsAdminController],
  providers: [
    CommissionEventsService,
    CommissionRunService,
    CommissionRunCron,
    CommissionsAdminService,
  ],
  exports: [CommissionEventsService, CommissionRunService],
})
export class CommissionsModule {}
