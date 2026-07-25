import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { AuthModule } from './auth/auth.module';
import { CommissionsModule } from './commissions/commissions.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { LedgerModule } from './ledger/ledger.module';
import { EcardsModule } from './ecards/ecards.module';
import { MembersModule } from './members/members.module';
import { PacksModule } from './packs/packs.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { ShopModule } from './shop/shop.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate-limiting global (anti-brute-force sur login / reset / vérification d'e-card, spec §12).
    //
    // DEUX seaux, tous deux actifs partout, que les routes sensibles resserrent :
    //  - `default` (60/min) casse les rafales ;
    //  - `hourly` (1000/h) borne l'acharnement patient, qu'un quota par minute laisse passer.
    // L'inscription (D-036 : elle consomme des e-cards) descend à 2/min et 5/h — voir
    // `MembersController`. Les deux comptent les requêtes, pas les succès : un échec de
    // paiement consomme du quota, sans quoi tâtonner serait gratuit.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 60 },
      { name: 'hourly', ttl: 3_600_000, limit: 1_000 },
    ]),
    // Crons : expiration des e-cards (quotidien, T5) ; run de commissions (hebdo, T7).
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    LedgerModule,
    CommissionsModule,
    MembersModule,
    EcardsModule,
    ShopModule,
    PacksModule,
    SettingsModule,
    // Tranche 8c — surfaces de supervision du back-office : agrégats du tableau de bord,
    // rapports, comptes administrateurs. Aucune ne porte de logique métier.
    DashboardModule,
    ReportsModule,
    AdminUsersModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
