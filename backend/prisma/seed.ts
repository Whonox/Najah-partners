import { NestFactory } from '@nestjs/core';
import { SeedModule } from '../src/seed/seed.module';
import { SeedService } from '../src/seed/seed.service';

/**
 * Runner du seed. Le contenu vit dans `src/seed/seed.service.ts` et passe par les VRAIS
 * services du backend (inscription, activation) : un arbre d'amorçage construit à coups
 * d'INSERT serait, par construction, incohérent avec le code qu'il est censé amorcer.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    await app.get(SeedService).run();
  } finally {
    // Sans fermeture explicite, le pool Postgres garde la boucle d'événements ouverte et le
    // processus ne rend jamais la main (`prisma migrate reset` resterait bloqué).
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
