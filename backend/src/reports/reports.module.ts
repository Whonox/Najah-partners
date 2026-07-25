import { Module } from '@nestjs/common';
import { ReportsAdminController } from './reports-admin.controller';
import { ReportsService } from './reports.service';

/**
 * Rapports et analytics (§7.2.10). LECTURE pure : aucun service de domaine n'est importé, donc
 * aucun rapport ne peut, même par accident, écrire une ligne ou déclencher un calcul métier.
 */
@Module({
  controllers: [ReportsAdminController],
  providers: [ReportsService],
})
export class ReportsModule {}
