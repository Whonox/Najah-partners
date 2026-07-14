import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BvLedgerModule } from '../bv-ledger/bv-ledger.module';
import { MembersModule } from '../members/members.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SeedService } from './seed.service';

/**
 * Contexte minimal du seed. Il n'importe VOLONTAIREMENT pas `AppModule` : celui-ci monte la
 * stratégie JWT (qui exige les secrets au démarrage) et, en Tranche 7, démarrera les crons —
 * un script de seed n'a rien à faire avec ça. On appelle les services de domaine directement,
 * jamais les contrôleurs : les guards d'authentification n'existent que dans le pipeline HTTP.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    BvLedgerModule,
    MembersModule,
  ],
  providers: [SeedService],
})
export class SeedModule {}
