import { Module } from '@nestjs/common';
import { LedgerAdminController } from './ledger-admin.controller';
import { LedgerAdminService } from './ledger-admin.service';
import { LedgerRegistryService } from './ledger-registry.service';
import { LedgerService } from './ledger.service';

/**
 * Grand livre — le journal des SOLDES, donc des DINARS (D-017, D-028). PrismaModule est @Global
 * (PrismaService injectable sans import) ; les guards d'auth sont globaux (Tranche 2).
 * `LedgerService` est exporté : e-cards, activation et commissions s'appuient dessus.
 */
@Module({
  controllers: [LedgerAdminController],
  providers: [LedgerService, LedgerAdminService, LedgerRegistryService],
  exports: [LedgerService, LedgerAdminService], // LedgerAdminService : genèse tracée du réseau (seed, D-019)
})
export class LedgerModule {}
