import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { InvalidProductImageError } from './shop.errors';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  ProductImageService,
} from './product-image.service';

/**
 * Ce que ces tests tiennent :
 *  — le type est reconnu par les OCTETS, jamais par ce que le client annonce. Un exécutable
 *    renommé `.jpg` est refusé, et un JPEG déclaré `text/plain` est accepté : c'est le
 *    contenu qui fait foi (D-059) ;
 *  — le PDF est refusé ICI alors qu'il est accepté pour une pièce d'identité — une photo de
 *    produit finit dans une balise `<img>` ;
 *  — le nom du fichier est posé par le SERVEUR : le nom fourni par le client, fût-il une
 *    traversée de chemin, ne se retrouve nulle part ;
 *  — la lecture refuse tout chemin qui sortirait de la racine de stockage, même si la base
 *    le lui donne — une donnée corrompue ne doit pas produire une lecture de fichier
 *    arbitraire.
 */

// Fichiers minimaux mais VALIDES : c'est leur en-tête qui est testé.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(20, 0x11),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(12, 0x22),
]);
const PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n', 'ascii'),
  Buffer.alloc(20, 0x33),
]);
const EXECUTABLE = Buffer.concat([
  Buffer.from('MZ', 'ascii'),
  Buffer.alloc(30, 0x44),
]);

describe('ProductImageService', () => {
  let root: string;
  let service: ProductImageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'najah-product-img-'));
    service = new ProductImageService({
      get: (_key: string, def?: string) => root || def,
    } as unknown as ConfigService);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function file(buffer: Buffer, originalname = 'photo.jpg') {
    return { buffer, size: buffer.length, originalname };
  }

  describe('formats — reconnus par les octets', () => {
    it.each([
      ['PNG', PNG, 'image/png', 'png'],
      ['JPEG', JPEG, 'image/jpeg', 'jpg'],
      ['WebP', WEBP, 'image/webp', 'webp'],
    ])('accepte un %s', async (_label, buffer, mime, ext) => {
      const stored = await service.store(file(buffer));
      expect(stored.mime).toBe(mime);
      expect(stored.relativePath.endsWith(`.${ext}`)).toBe(true);
    });

    it('refuse un PDF — accepté pour une pièce d’identité, pas pour une photo de produit', async () => {
      await expect(service.store(file(PDF))).rejects.toBeInstanceOf(
        InvalidProductImageError,
      );
    });

    it('refuse un exécutable renommé en .jpg — le nom ne prouve rien', async () => {
      await expect(
        service.store(file(EXECUTABLE, 'innocent.jpg')),
      ).rejects.toBeInstanceOf(InvalidProductImageError);
    });

    it('accepte un JPEG quel que soit le nom annoncé — le contenu fait foi', async () => {
      const stored = await service.store(file(JPEG, 'notes.txt'));
      expect(stored.mime).toBe('image/jpeg');
    });

    it('refuse un fichier vide ou tronqué', async () => {
      await expect(
        service.store({ buffer: Buffer.alloc(0), size: 0 }),
      ).rejects.toBeInstanceOf(InvalidProductImageError);
      await expect(
        service.store({ buffer: Buffer.alloc(4), size: 4 }),
      ).rejects.toBeInstanceOf(InvalidProductImageError);
    });

    it('refuse un fichier trop lourd', async () => {
      await expect(
        service.store({ buffer: PNG, size: MAX_PRODUCT_IMAGE_BYTES + 1 }),
      ).rejects.toBeInstanceOf(InvalidProductImageError);
    });
  });

  describe('nom du fichier — posé par le serveur', () => {
    it('ne reprend jamais le nom du client, même piégé', async () => {
      const stored = await service.store(file(PNG, '../../../etc/passwd.png'));
      expect(stored.relativePath).not.toContain('passwd');
      expect(stored.relativePath).not.toContain('..');
      expect(stored.relativePath).toMatch(
        /^product-images\/\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/,
      );
    });

    it('donne un chemin distinct à deux dépôts du même fichier', async () => {
      const a = await service.store(file(PNG));
      const b = await service.store(file(PNG));
      expect(a.relativePath).not.toBe(b.relativePath);
    });
  });

  describe('lecture', () => {
    it('relit exactement ce qui a été écrit', async () => {
      const stored = await service.store(file(PNG));
      const read = await service.read(stored.relativePath);
      expect(read?.mime).toBe('image/png');
      expect(read?.buffer.equals(PNG)).toBe(true);
    });

    it('rend null pour un chemin qui SORT de la racine de stockage', async () => {
      const outside = join(root, '..', 'secret.png');
      await writeFile(outside, PNG);
      try {
        await expect(service.read('../secret.png')).resolves.toBeNull();
      } finally {
        await rm(outside, { force: true });
      }
    });

    it('rend null pour une extension inattendue', async () => {
      await expect(
        service.read('product-images/2026-07/x.exe'),
      ).resolves.toBeNull();
    });

    it('rend null — et non une erreur — quand le fichier a disparu', async () => {
      const stored = await service.store(file(PNG));
      await rm(join(root, stored.relativePath));
      await expect(service.read(stored.relativePath)).resolves.toBeNull();
    });
  });

  describe('suppression', () => {
    it('supprime le fichier', async () => {
      const stored = await service.store(file(PNG));
      await service.discard(stored.relativePath);
      await expect(service.read(stored.relativePath)).resolves.toBeNull();
    });

    it('ne lève pas sur un fichier déjà absent — le nettoyage est « au mieux »', async () => {
      await expect(
        service.discard('product-images/2026-07/absent.png'),
      ).resolves.toBeUndefined();
    });
  });

  describe('cohabitation avec les pièces d’identité', () => {
    it('range les photos dans leur propre sous-dossier', async () => {
      const stored = await service.store(file(PNG));
      expect(stored.relativePath.startsWith('product-images/')).toBe(true);
      // Le fichier existe bien là où le chemin le dit.
      await expect(
        readFile(join(root, stored.relativePath)),
      ).resolves.toBeDefined();
    });
  });
});
