import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { buildOpenApiDocument } from '../swagger';

/**
 * Exporte le contrat OpenAPI en fichier versionné (`backend/openapi.json`), sans ouvrir
 * de port HTTP (pas de `app.listen()`) : c'est ce fichier, pas un serveur qui tourne,
 * que les fronts consomment pour générer leur client TS (`npm run generate:api`).
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildOpenApiDocument(app);
  const outPath = join(__dirname, '..', '..', '..', 'openapi.json');
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
  await app.close();
  console.log(`OpenAPI document written to ${outPath}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
