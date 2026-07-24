import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Derrière un reverse-proxy (nginx, load balancer), `req.ip` vaut l'adresse du PROXY tant
  // qu'Express ne sait pas à quels sauts se fier : toutes les requêtes du monde partagent
  // alors un seul seau de rate-limiting, et le quota par IP de l'inscription publique
  // (D-021, D-036) ne protège plus rien. `TRUST_PROXY` = nombre de sauts de confiance
  // (« 1 » derrière un nginx), une liste d'adresses, ou « true ». Non renseigné : aucune
  // confiance — le bon réglage en direct, car un `X-Forwarded-For` est trivial à forger.
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    const hops = Number(trustProxy);
    app.set('trust proxy', Number.isInteger(hops) ? hops : trustProxy);
  }

  // Cookies (refresh token httpOnly) + validation stricte des DTO.
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS avec credentials : les fronts (SPA) envoient le cookie refresh.
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });

  // Swagger : source de vérité des types pour la génération du client TS des fronts.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Najah Partners API')
    .setDescription('API backend — plateforme MLM (BV, e-cards, commissions)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
