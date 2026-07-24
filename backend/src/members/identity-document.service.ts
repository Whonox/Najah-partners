import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, extname, isAbsolute, join, resolve, sep } from 'path';
import { InvalidIdDocumentError } from './members.errors';

/** Taille maximale acceptée pour une image de pièce d'identité. */
export const MAX_ID_DOCUMENT_BYTES = 5 * 1024 * 1024;

/**
 * Types réellement acceptés, reconnus par leurs OCTETS et non par le `Content-Type` du
 * client (trivialement usurpable : un script peut se déclarer `image/jpeg`).
 */
const SIGNATURES: Array<{ mime: string; ext: string; matches: (b: Buffer) => boolean }> = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: 'png',
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'application/pdf',
    ext: 'pdf',
    matches: (b) => b.subarray(0, 4).toString('ascii') === '%PDF',
  },
];

/**
 * Stockage local des pièces d'identité (D-018, périmètre Tranche 4 : dépôt du fichier
 * uniquement — la file de vérification admin est en Tranche 8).
 *
 * Le fichier est écrit HORS du dépôt git (`IDENTITY_UPLOAD_DIR`), sous un nom généré par le
 * serveur (jamais le nom du client : traversée de chemin, extension piégée). Seul le chemin
 * RELATIF est stocké en base — déplacer le stockage ne casse aucune ligne. Le fichier n'est
 * servi par aucune route : personne ne peut le lire avant la Tranche 8.
 */
@Injectable()
export class IdentityDocumentService {
  private readonly logger = new Logger(IdentityDocumentService.name);

  constructor(private readonly config: ConfigService) {}

  /** Racine de stockage, résolue depuis le répertoire de travail du backend. */
  private root(): string {
    const configured = this.config.get<string>(
      'IDENTITY_UPLOAD_DIR',
      '../../najah-uploads',
    );
    return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  }

  /** Chemin absolu d'un document, depuis le chemin relatif stocké en base. */
  absolutePath(relativePath: string): string {
    return join(this.root(), relativePath);
  }

  /**
   * Valide (taille + octets réels) et écrit le fichier. Renvoie le chemin RELATIF.
   * Appelé AVANT la transaction d'inscription : en cas d'échec de celle-ci, `discard()`
   * nettoie le fichier — un membre ne peut donc jamais exister sans son document, ni un
   * document sans son membre (au pire, un orphelin si le process meurt entre les deux).
   */
  async store(file: {
    buffer: Buffer;
    size: number;
    originalname?: string;
  }): Promise<{ relativePath: string; mime: string }> {
    if (file.size > MAX_ID_DOCUMENT_BYTES) {
      throw new InvalidIdDocumentError('taille supérieure à 5 Mo.');
    }
    if (file.size === 0 || file.buffer.length < 12) {
      throw new InvalidIdDocumentError('fichier vide ou illisible.');
    }

    const signature = SIGNATURES.find((s) => s.matches(file.buffer));
    if (!signature) {
      throw new InvalidIdDocumentError(
        'format non reconnu (formats acceptés : JPEG, PNG, WebP, PDF).',
      );
    }

    // Rangement par mois : un répertoire unique de plusieurs dizaines de milliers de
    // fichiers devient pénible à sauvegarder et à parcourir.
    const now = new Date();
    const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const relativePath = `id-documents/${folder}/${randomUUID()}.${signature.ext}`;
    const absolute = this.absolutePath(relativePath);

    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.buffer, { flag: 'wx' }); // wx : jamais d'écrasement

    return { relativePath, mime: signature.mime };
  }

  /**
   * Relit un document déposé, pour la route admin qui le sert (T8b — la vérification
   * d'identité, D-018). Le chemin vient TOUJOURS de la base, jamais d'un paramètre de
   * requête ; on le revérifie tout de même contre la racine de stockage, parce qu'un
   * `..` arrivé là par une migration ratée ou une donnée corrompue ferait sortir la lecture
   * du répertoire d'uploads — et une lecture de fichier arbitraire ne se rattrape pas.
   *
   * Le MIME est déduit de l'extension, elle-même posée par `store()` d'après les OCTETS du
   * fichier : ce n'est pas le client qui l'a choisie.
   */
  async read(
    relativePath: string,
  ): Promise<{ buffer: Buffer; mime: string } | null> {
    const absolute = resolve(this.absolutePath(relativePath));
    const root = resolve(this.root());
    if (absolute !== root && !absolute.startsWith(root + sep)) {
      this.logger.error(
        `Chemin de pièce d'identité hors du répertoire de stockage, lecture refusée : ${relativePath}`,
      );
      return null;
    }

    const ext = extname(absolute).slice(1).toLowerCase();
    const signature = SIGNATURES.find((s) => s.ext === ext);
    if (!signature) {
      this.logger.error(
        `Extension de pièce d'identité inattendue, lecture refusée : ${relativePath}`,
      );
      return null;
    }

    try {
      return { buffer: await readFile(absolute), mime: signature.mime };
    } catch (error) {
      // Fichier absent : la ligne existe mais le stockage a bougé. On le signale et on rend
      // un 404 — pas une 500 : le back-office doit pouvoir afficher la fiche sans l'image.
      this.logger.warn(
        `Pièce d'identité illisible (${relativePath}) : ${String(error)}`,
      );
      return null;
    }
  }

  /** Compensation : supprime un fichier dont la transaction d'inscription a échoué. */
  async discard(relativePath: string): Promise<void> {
    try {
      await unlink(this.absolutePath(relativePath));
    } catch (error) {
      // Le nettoyage est « au mieux » : un fichier orphelin est sans conséquence
      // fonctionnelle, mais on veut le savoir.
      this.logger.warn(
        `Pièce d'identité orpheline non supprimée (${relativePath}) : ${String(error)}`,
      );
    }
  }
}
