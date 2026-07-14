import { Injectable } from '@nestjs/common';
import { BvLedgerEntry, BvMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  InsufficientBalanceError,
  InvalidMovementAmountError,
  MemberNotFoundError,
  ReasonRequiredError,
} from './bv-ledger.errors';
import {
  BvHistoryPage,
  BvHistoryQuery,
  RecordMovementInput,
} from './bv-ledger.types';

const TX_TIMEOUT_MS = 10_000;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Moteur de solde BV (D-017). SEUL point d'écriture des soldes du projet :
 * e-cards, activation et commissions (tranches suivantes) passeront par
 * `recordMovementInTx` pour composer leur propre transaction atomique.
 *
 * Invariants garantis :
 *  - un débit ne rend jamais le solde négatif (vérifié SOUS verrou de ligne) ;
 *  - chaque mouvement écrit une ligne (montant signé + balanceAfter) ET met à
 *    jour Member.bvBalance dans la MÊME transaction (jamais de débit sans crédit).
 */
@Injectable()
export class BvLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enregistre un mouvement dans sa propre transaction (cas autonome).
   * Pour composer avec d'autres écritures (e-card, activation…), utiliser
   * `recordMovementInTx` dans une transaction ouverte par l'appelant.
   */
  async recordMovement(input: RecordMovementInput): Promise<BvLedgerEntry> {
    return this.prisma.$transaction(
      (tx) => this.recordMovementInTx(tx, input),
      { timeout: TX_TIMEOUT_MS },
    );
  }

  /**
   * Cœur atomique, à exécuter dans une transaction Prisma. Verrouille la ligne
   * du membre (Prisma ne verrouille pas nativement), relit le solde sous verrou,
   * refuse un solde négatif, puis écrit la ligne de mouvement et met à jour le
   * solde. Le verrou tient jusqu'au commit/rollback : deux débits concurrents
   * sont sérialisés (le second relit le solde à jour).
   *
   * FOR NO KEY UPDATE, et surtout PAS `FOR UPDATE` (D-024) : `FOR UPDATE` entre en
   * conflit avec le `FOR KEY SHARE` que Postgres prend sur la ligne référencée à
   * chaque INSERT pointant vers ce membre (login → RefreshToken, e-card, commande,
   * inscription d'un filleul). Un débit BV bloquerait donc des opérations sans
   * rapport, et provoque un interblocage dès qu'on y ajoute la remontée d'arbre.
   * NO KEY UPDATE reste exclusif entre écrivains : la sérialisation des débits —
   * donc l'invariant « solde jamais négatif » — est intacte.
   */
  async recordMovementInTx(
    tx: Prisma.TransactionClient,
    input: RecordMovementInput,
  ): Promise<BvLedgerEntry> {
    this.validate(input);

    // Identifiants quotés : Prisma mappe le modèle `Member` et le champ
    // `bvBalance` en casse mixte (Postgres replierait sinon en minuscules).
    const locked = await tx.$queryRaw<Array<{ bvBalance: number }>>`
      SELECT "bvBalance" FROM "Member" WHERE "id" = ${input.memberId} FOR NO KEY UPDATE
    `;
    if (locked.length === 0) {
      throw new MemberNotFoundError(input.memberId);
    }

    const currentBalance = locked[0].bvBalance;
    const newBalance = currentBalance + input.amountBv;
    if (newBalance < 0) {
      throw new InsufficientBalanceError(
        input.memberId,
        currentBalance,
        input.amountBv,
      );
    }

    const reason = input.reason?.trim() ? input.reason.trim() : null;
    const entry = await tx.bvLedgerEntry.create({
      data: {
        memberId: input.memberId,
        type: input.type,
        amountBv: input.amountBv,
        balanceAfter: newBalance,
        ecardId: input.ecardId ?? null,
        commissionId: input.commissionId ?? null,
        reason,
      },
    });

    await tx.member.update({
      where: { id: input.memberId },
      data: { bvBalance: newBalance },
    });

    return entry;
  }

  /** Solde BV courant (source de vérité = Member.bvBalance). */
  async getBalance(memberId: number): Promise<number> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { bvBalance: true },
    });
    if (!member) {
      throw new MemberNotFoundError(memberId);
    }
    return member.bvBalance;
  }

  /** Historique paginé des mouvements d'un membre (plus récent d'abord). */
  async getHistory(
    memberId: number,
    query: BvHistoryQuery = {},
  ): Promise<BvHistoryPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    // 404 explicite si le membre n'existe pas (plutôt qu'une page vide ambiguë).
    await this.getBalance(memberId);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.bvLedgerEntry.findMany({
        where: { memberId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.bvLedgerEntry.count({ where: { memberId } }),
    ]);

    return { items, total, page, pageSize };
  }

  private validate(input: RecordMovementInput): void {
    if (!Number.isInteger(input.amountBv) || input.amountBv === 0) {
      throw new InvalidMovementAmountError(input.amountBv);
    }
    if (
      input.type === BvMovementType.ADMIN_ADJUSTMENT &&
      !input.reason?.trim()
    ) {
      throw new ReasonRequiredError();
    }
  }
}
