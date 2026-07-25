import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { CommissionEventsService } from './commission-events.service';
import { CommissionExplainService } from './commission-explain.service';
import { CommissionRunCron } from './commission-run.cron';
import { CommissionRunService } from './commission-run.service';
import { CommissionsAdminController } from './commissions-admin.controller';
import { CommissionsAdminService } from './commissions-admin.service';
import { CommissionsPortalController } from './commissions-portal.controller';
import { CommissionsPortalService } from './commissions-portal.service';

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
 *
 * La Tranche 9 y ajoute la surface AFFILIÉ (`CommissionsPortalService`), qui répond à la même
 * question que la supervision — « pourquoi ce montant ? » — et s'appuie donc sur le MÊME
 * `CommissionExplainService`. Deux implémentations auraient fini par expliquer différemment un
 * seul et même versement, à l'affilié d'un côté et au gestionnaire de l'autre.
 */
@Module({
  imports: [LedgerModule],
  controllers: [CommissionsAdminController, CommissionsPortalController],
  providers: [
    CommissionEventsService,
    CommissionRunService,
    CommissionRunCron,
    CommissionsAdminService,
    // Tranche 9 — la ventilation d'un règlement, PARTAGÉE entre la supervision admin et le
    // portail affilié : une seule implémentation, donc une seule explication d'un versement.
    CommissionExplainService,
    CommissionsPortalService,
  ],
  exports: [CommissionEventsService, CommissionRunService],
})
export class CommissionsModule {}
