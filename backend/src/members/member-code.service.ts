import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Préfixe et largeur du code membre : c'est une identité, pas un réglage (spec §5.3). */
const MEMBER_CODE_PREFIX = 'NP';
const MEMBER_CODE_WIDTH = 6;

/**
 * Le seed cale la séquence sur ce dernier numéro d'amorçage (D-019, révisée : le réseau
 * d'amorçage compte 500 comptes, NP000963 → NP001462). Le PREMIER code reste NP000963 :
 * c'est lui qui est verrouillé par la décision, le dernier n'en est que la conséquence
 * (963 + 500 − 1). Changer la taille du réseau change cette borne, jamais le point de départ.
 */
export const SEED_LAST_MEMBER_NUMBER = 1462;

/** Reconnaît un code membre canonique (les fixtures de test n'en sont pas). */
export const MEMBER_CODE_PATTERN = /^NP\d+$/;

@Injectable()
export class MemberCodeService {
  /**
   * Alloue le prochain code membre (`NP` + numéro auto-incrémenté, 6 chiffres).
   *
   * Le formatage est fait EN SQL : `nextval()` renvoie un `bigint`, donc un `BigInt` côté
   * Node — qui ferait exploser la sérialisation JSON bien plus loin, hors de ce fichier.
   * Aucun BigInt ne franchit la frontière.
   *
   * `nextval()` n'est pas transactionnel : deux inscriptions simultanées obtiennent deux
   * numéros distincts sans jamais s'attendre, et un rollback laisse un trou dans la
   * numérotation. C'est assumé : seule l'UNICITÉ du code est un invariant.
   */
  async allocate(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ code: string }>>`
      SELECT ${MEMBER_CODE_PREFIX} || lpad(nextval('member_code_seq')::text, ${MEMBER_CODE_WIDTH}::int, '0') AS "code"
    `;
    return rows[0].code;
  }
}
