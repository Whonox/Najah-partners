import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * Construction du document OpenAPI, partagée entre le bootstrap HTTP (`main.ts`, sert
 * `/docs`) et l'export statique (`scripts/export-openapi.ts`, sert `openapi.json` — le
 * contrat que les fronts consomment pour générer leur client TS).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Najah Partners API')
    .setDescription('API backend — plateforme MLM (BV, e-cards, commissions)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
