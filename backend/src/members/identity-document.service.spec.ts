import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  IdentityDocumentService,
  MAX_ID_DOCUMENT_BYTES,
} from './identity-document.service';
import { InvalidIdDocumentError } from './members.errors';

/**
 * Le `Content-Type` annoncé par le client est trivialement usurpable : ces tests vérifient
 * qu'on ne se fie qu'aux OCTETS du fichier, et que rien du nom d'origine ne survit.
 */

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

function file(buffer: Buffer, originalname = 'cin.jpg') {
  return { buffer, size: buffer.length, originalname };
}

describe('IdentityDocumentService', () => {
  let dir: string;
  let service: IdentityDocumentService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'najah-id-'));
    const config = {
      get: jest.fn((key: string, def?: string) =>
        key === 'IDENTITY_UPLOAD_DIR' ? dir : def,
      ),
    } as unknown as ConfigService;
    service = new IdentityDocumentService(config);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('écrit un PNG et renvoie un chemin RELATIF au nom généré par le serveur', async () => {
    const stored = await service.store(file(PNG, '../../evil.php'));

    expect(stored.mime).toBe('image/png');
    expect(stored.relativePath).toMatch(
      /^id-documents\/\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/,
    );
    // Rien du nom d'origine ne survit : ni le nom, ni l'extension, ni la traversée.
    expect(stored.relativePath).not.toContain('evil');
    expect(stored.relativePath).not.toContain('..');
    await expect(readFile(service.absolutePath(stored.relativePath))).resolves.toEqual(
      PNG,
    );
  });

  it('l’extension vient des OCTETS, pas du nom du client', async () => {
    const stored = await service.store(file(JPEG, 'photo.png'));
    expect(stored.relativePath.endsWith('.jpg')).toBe(true);
  });

  it('refuse un script déguisé en image (magic bytes)', async () => {
    const php = Buffer.from('<?php system($_GET["c"]); ?>'.padEnd(64, ' '));
    await expect(service.store(file(php, 'cin.jpg'))).rejects.toBeInstanceOf(
      InvalidIdDocumentError,
    );
  });

  it('refuse un fichier trop volumineux', async () => {
    await expect(
      service.store({
        buffer: PNG,
        size: MAX_ID_DOCUMENT_BYTES + 1,
        originalname: 'grand.png',
      }),
    ).rejects.toBeInstanceOf(InvalidIdDocumentError);
  });

  it('refuse un fichier vide', async () => {
    await expect(service.store(file(Buffer.alloc(0)))).rejects.toBeInstanceOf(
      InvalidIdDocumentError,
    );
  });

  it('discard supprime le fichier d’une inscription annulée', async () => {
    const stored = await service.store(file(PNG));
    await service.discard(stored.relativePath);
    await expect(readFile(service.absolutePath(stored.relativePath))).rejects.toThrow();
  });

  it('discard sur un fichier déjà absent ne lève pas', async () => {
    await expect(service.discard('id-documents/2026-01/absent.png')).resolves.toBeUndefined();
  });
});
