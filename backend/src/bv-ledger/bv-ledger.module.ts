import { Module } from '@nestjs/common';
import { BvAdminController } from './bv-admin.controller';
import { BvAdminService } from './bv-admin.service';
import { BvLedgerService } from './bv-ledger.service';

/**
 * Grand livre BV (D-017). PrismaModule est @Global (PrismaService injectable
 * sans import) ; les guards d'auth sont globaux (Tranche 2). `BvLedgerService`
 * est exporté : e-cards, activation et commissions s'appuieront dessus.
 */
@Module({
  controllers: [BvAdminController],
  providers: [BvLedgerService, BvAdminService],
  exports: [BvLedgerService, BvAdminService], // BvAdminService : genèse tracée du réseau (seed, D-019)
})
export class BvLedgerModule {}
