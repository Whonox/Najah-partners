import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BvLedgerModule } from './bv-ledger/bv-ledger.module';
import { EcardsModule } from './ecards/ecards.module';
import { MembersModule } from './members/members.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShopModule } from './shop/shop.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate-limiting global (anti-brute-force sur login / reset / vérification d'e-card, spec §12).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    // Crons : expiration des e-cards (quotidien, T5) ; run de commissions (hebdo, T7).
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    BvLedgerModule,
    MembersModule,
    EcardsModule,
    ShopModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
