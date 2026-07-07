import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Charge les variables de `backend/.env` (dont DATABASE_URL) pour les tests
 * d'intégration, sans dépendance externe (dotenv n'est pas installé). Les tests
 * unitaires (`npm test`) n'en ont pas besoin : ils mockent Prisma.
 */
if (!process.env.DATABASE_URL) {
  try {
    const content = readFileSync(resolve(__dirname, '..', '.env'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env absent : Prisma échouera avec un message explicite au $connect().
  }
}
