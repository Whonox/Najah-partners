import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, extname, isAbsolute, join, resolve } from 'path';
import {
  DISPLAYABLE_IMAGE_MIMES,
  detectSignature,
  isInsideRoot,
  signatureByExtension,
} from '../common/file-signatures';
import { InvalidProductImageError } from './shop.errors';

/** Taille maximale d'une photo de produit. */
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

/** Nombre maximal de photos par produit — au-delà, une fiche devient illisible. */
export const MAX_IMAGES_PER_PRODUCT = 6;

/**
 * Stockage des images produit (D-054, D-059).
 *
 * ═══ CHEMIN RELATIF EN BASE, JAMAIS UNE URL ═══
 * `Product.images` porte des chemins RELATIFS. Y stocker une URL absolue est la faute
 * classique : elle survit au changement de domaine, de port de développement ou de CDN, et
 * il faut alors une migration pour un simple déménagement de fichiers. Un chemin relatif plus
 * une route de service laissent les deux libres.
 *
 * ═══ MÊMES RÈGLES QUE LES PIÈCES D'IDENTITÉ (D-018) ═══
 * Fichier écrit HORS du dépôt git, sous un nom généré par le SERVEUR (jamais celui du
 * client : traversée de chemin, extension piégée), type reconnu par les OCTETS et non par le
 * `Content-Type` annoncé. La table de signatures est partagée — voir
 * `common/file-signatures.ts` pour la raison.
 *
 * ═══ UNE DIFFÉRENCE ASSUMÉE : PAS DE PDF ═══
 * Une pièce d'identité peut être un PDF (un scan d'administration en est souvent un) ; une
 * photo de produit finit dans une balise `<img>` et n'a rien à y faire.
 *
 * ═══ ET UNE AUTRE : LA LECTURE EST OUVERTE ═══
 * Une pièce d'identité ne se lit que par l'administration. Une photo de produit est faite
 * pour être vue — par l'affilié, et un jour par la vitrine publique. Le contrôle d'accès est
 * donc posé sur l'ÉCRITURE seule (SUPER_ADMIN + MANAGER, comme le reste du catalogue).
 */
@Injectable()
export class ProductImageService {
  private readonly logger = new Logger(ProductImageService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Racine de stockage. Même variable que les pièces d'identité : un seul répertoire à
   * sauvegarder et à monter en production, et les sous-dossiers séparent les usages.
   */
  private root(): string {
    const configured = this.config.get<string>(
      'IDENTITY_UPLOAD_DIR',
      '../../najah-uploads',
    );
    return isAbsolute(configured)
      ? configured
      : resolve(process.cwd(), configured);
  }

  absolutePath(relativePath: string): string {
    return join(this.root(), relativePath);
  }

  /** Valide (taille + octets réels) et écrit le fichier. Rend le chemin RELATIF. */
  async store(file: {
    buffer: Buffer;
    size: number;
    originalname?: string;
  }): Promise<{ relativePath: string; mime: string }> {
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      throw new InvalidProductImageError('taille supérieure à 5 Mo.');
    }
    if (file.size === 0 || file.buffer.length < 12) {
      throw new InvalidProductImageError('fichier vide ou illisible.');
    }

    const signature = detectSignature(file.buffer, DISPLAYABLE_IMAGE_MIMES);
    if (!signature) {
      throw new InvalidProductImageError(
        'format non reconnu (formats acceptés : JPEG, PNG, WebP).',
      );
    }

    // Rangement par mois, comme les pièces d'identité : un répertoire unique de plusieurs
    // milliers de fichiers devient pénible à sauvegarder et à parcourir.
    const now = new Date();
    const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const relativePath = `product-images/${folder}/${randomUUID()}.${signature.ext}`;
    const absolute = this.absolutePath(relativePath);

    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.buffer, { flag: 'wx' }); // wx : jamais d'écrasement

    return { relativePath, mime: signature.mime };
  }

  /**
   * Relit une image pour la route qui la sert. Le chemin vient TOUJOURS de la base, jamais
   * d'un paramètre de requête ; il est revérifié contre la racine de stockage malgré tout.
   */
  async read(
    relativePath: string,
  ): Promise<{ buffer: Buffer; mime: string } | null> {
    const absolute = resolve(this.absolutePath(relativePath));
    if (!isInsideRoot(absolute, this.root())) {
      this.logger.error(
        `Chemin d'image produit hors du répertoire de stockage, lecture refusée : ${relativePath}`,
      );
      return null;
    }

    const signature = signatureByExtension(extname(absolute).slice(1));
    if (!signature) {
      this.logger.error(
        `Extension d'image produit inattendue, lecture refusée : ${relativePath}`,
      );
      return null;
    }

    try {
      return { buffer: await readFile(absolute), mime: signature.mime };
    } catch (error) {
      // Fichier absent : la ligne existe mais le stockage a bougé. 404 plutôt que 500 —
      // la fiche produit doit rester consultable sans sa photo.
      this.logger.warn(
        `Image produit illisible (${relativePath}) : ${String(error)}`,
      );
      return null;
    }
  }

  /**
   * Supprime un fichier devenu sans référence. Le nettoyage est « au mieux » : un fichier
   * orphelin n'a aucune conséquence fonctionnelle, mais on veut le savoir.
   */
  async discard(relativePath: string): Promise<void> {
    try {
      await unlink(this.absolutePath(relativePath));
    } catch (error) {
      this.logger.warn(
        `Image produit orpheline non supprimée (${relativePath}) : ${String(error)}`,
      );
    }
  }
}
