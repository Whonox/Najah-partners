import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { StepUpController } from './step-up.controller';
import { StepUpService } from './step-up.service';

/**
 * Seconde authentification (D-051, D-058), en module AUTONOME.
 *
 * ═══ POURQUOI PAS DANS `MembersModule` ═══
 * Le garde qui l'applique (`StepUpGuard`) est un garde GLOBAL, déclaré par `AuthModule`. S'il
 * fallait importer `MembersModule` depuis `AuthModule` pour l'atteindre, on tirerait dans
 * l'authentification tout le domaine métier — arbre, activation, e-cards, commissions — et le
 * graphe de modules se refermerait en cycle à la première dépendance inverse.
 *
 * Ce module ne dépend que de Prisma, de JWT et de la configuration : `AuthModule` peut donc
 * l'importer sans rien entraîner d'autre.
 */
@Module({
  imports: [ConfigModule, PrismaModule, JwtModule.register({})],
  controllers: [StepUpController],
  providers: [StepUpService],
  exports: [StepUpService],
})
export class StepUpModule {}
