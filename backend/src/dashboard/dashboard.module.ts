import { Module } from '@nestjs/common';
import { DashboardAdminController } from './dashboard-admin.controller';
import { DashboardService } from './dashboard.service';

/**
 * Tableau de bord admin (§7.2.1). Module de LECTURE pure : aucun service de domaine n'est
 * importé, aucune écriture n'est possible depuis ici. Il ne dépend que de Prisma (global) et
 * des helpers de calendrier du moteur de commissions — sans les dupliquer.
 */
@Module({
  controllers: [DashboardAdminController],
  providers: [DashboardService],
})
export class DashboardModule {}
