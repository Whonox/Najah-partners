import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { EcardExpirationCron } from './ecard-expiration.cron';
import { EcardsAdminController } from './ecards-admin.controller';
import { EcardsAdminService } from './ecards-admin.service';
import { EcardsController } from './ecards.controller';
import { EcardsService } from './ecards.service';

/**
 * E-cards (Tranche 5). `LedgerModule` est importé pour le débit à la création et le
 * remboursement à l'expiration/révocation : aucune écriture de solde ne se fait ailleurs
 * que dans le grand livre (D-017).
 *
 * Aucune dépendance vers `MembersModule` : la stratégie de paiement `EcardActivationPayment`
 * n'importe de `members/` qu'un TYPE (`ActivationPayment`), jamais un provider — les deux
 * modules restent indépendants, et c'est le checkout (Tranche 6) qui les assemblera.
 */
@Module({
  imports: [LedgerModule],
  controllers: [EcardsController, EcardsAdminController],
  providers: [EcardsService, EcardsAdminService, EcardExpirationCron],
  exports: [EcardsService],
})
export class EcardsModule {}
