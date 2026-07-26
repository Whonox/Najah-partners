import { resolve, sep } from 'path';

/**
 * Reconnaissance des types de fichiers PAR LEURS OCTETS, partagée par tous les dépôts de
 * fichiers du projet (pièces d'identité — D-018 ; images produit — D-054/D-059).
 *
 * ═══ POURQUOI LES OCTETS ET JAMAIS LE `Content-Type` ═══
 * Le type annoncé par le client est trivialement usurpable : un script se déclare
 * `image/jpeg` sans effort. Seul le contenu réel du fichier fait foi. Accepter la
 * déclaration reviendrait à laisser déposer n'importe quoi sous une extension d'image.
 *
 * ═══ POURQUOI CETTE TABLE EST PARTAGÉE ═══
 * Elle a d'abord vécu dans `IdentityDocumentService` (Tranche 4). L'y laisser et la recopier
 * pour les images produit garantissait qu'un durcissement futur — un format retiré, une
 * signature corrigée — n'atterrisse que dans l'un des deux dépôts, l'autre restant
 * silencieusement vulnérable. Une règle de sécurité dupliquée est une règle qui divergera.
 *
 * Chaque appelant choisit en revanche les formats qu'il ACCEPTE : une pièce d'identité peut
 * être un PDF (un scan d'administration en est souvent un), une photo de produit non — elle
 * finit dans une balise `<img>`.
 */
export interface FileSignature {
  mime: string;
  ext: string;
  matches: (bytes: Buffer) => boolean;
}

export const FILE_SIGNATURES: readonly FileSignature[] = [
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

/** Formats acceptés pour une image destinée à être affichée dans une page (D-059). */
export const DISPLAYABLE_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Reconnaît le type réel d'un fichier, restreint aux MIME autorisés par l'appelant.
 * Rend `undefined` si le contenu ne correspond à aucun format accepté.
 */
export function detectSignature(
  bytes: Buffer,
  allowedMimes: readonly string[],
): FileSignature | undefined {
  return FILE_SIGNATURES.find(
    (signature) =>
      allowedMimes.includes(signature.mime) && signature.matches(bytes),
  );
}

/** Retrouve la signature d'après l'extension POSÉE PAR LE SERVEUR (jamais celle du client). */
export function signatureByExtension(ext: string): FileSignature | undefined {
  return FILE_SIGNATURES.find(
    (signature) => signature.ext === ext.toLowerCase(),
  );
}

/**
 * Vérifie qu'un chemin absolu reste sous la racine de stockage.
 *
 * Le chemin vient toujours de la base et jamais d'une requête — mais un `..` arrivé là par
 * une migration ratée ou une donnée corrompue ferait sortir la lecture du répertoire
 * d'uploads, et une lecture de fichier arbitraire ne se rattrape pas.
 */
export function isInsideRoot(absolute: string, root: string): boolean {
  const a = resolve(absolute);
  const r = resolve(root);
  return a === r || a.startsWith(r + sep);
}
