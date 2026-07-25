import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ActorTypeGuard } from './guards/actor-type.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OnboardingGuard } from './guards/onboarding.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordResetService } from './password-reset.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [ConfigModule, PrismaModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordResetService,
    JwtAccessStrategy,
    // Guards globaux : authentification par défaut (opt-out via @Public), puis
    // cloisonnement type d'acteur, puis RBAC. L'ordre suit la déclaration.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ActorTypeGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Parcours de première connexion (D-050/D-057) — EN DERNIER, et c'est délibéré : il lit
    // `request.user`, que la stratégie JWT n'a posé qu'après `JwtAuthGuard`, et n'a de sens
    // que pour un acteur déjà authentifié ET reconnu comme MEMBER. Placé plus haut, il ferait
    // une lecture de base sur des requêtes qui vont de toute façon être rejetées.
    { provide: APP_GUARD, useClass: OnboardingGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
