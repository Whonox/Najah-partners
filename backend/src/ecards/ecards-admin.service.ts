import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZERO_DT, money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  EcardAdminDetailDto,
  EcardAdminPageDto,
  EcardAdminRowDto,
} from './dto/ecard-admin-response.dto';
import { AdminEcardsQueryDto } from './dto/ecards-query.dto';

const DEFAULT_PAGE_SIZE = 20;

const ROW_INCLUDE = {
  creator: { select: { id: true, memberCode: true, firstName: true, lastName: true } },
  user: { select: { id: true, memberCode: true, firstName: true, lastName: true } },
  order: { select: { id: true, context: true } },
  membershipPayment: { select: { id: true, type: true } },
} satisfies Prisma.EcardInclude;

type EcardRow = Prisma.EcardGetPayload<{ include: typeof ROW_INCLUDE }>;

/**
 * LECTURE des e-cards pour le back-office (spec §7.2.9). Les actions (genèse, révocation,
 * prolongation) restent dans `EcardsService`, qui seul sait verrouiller et rembourser.
 *
 * ═══ AUCUNE MÉTHODE DE CE SERVICE NE RENVOIE UN CODE ═══
 * Le `select`/`include` ne demande jamais la colonne `code`, et le mapping ne pourrait pas la
 * poser : elle n'existe pas dans `EcardAdminRowDto`. La recherche par code compare la valeur
 * saisie à `code` en égalité stricte puis projette la carte SANS le code — chercher n'est pas
 * restituer. C'est la même prudence qu'ailleurs dans le projet : on trace `Ecard:<id>`, jamais
 * un code, y compris dans les erreurs.
 */
@Injectable()
export class EcardsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminEcardsQueryDto = {}): Promise<EcardAdminPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = this.buildWhere(query);
    const sort = query.sort ?? 'createdAt';
    const direction = query.direction ?? 'desc';

    const [ecards, total, sum] = await this.prisma.$transaction([
      this.prisma.ecard.findMany({
        where,
        include: ROW_INCLUDE,
        // `id` en second critère : `usedAt`/`expiresAt` sont nullables et beaucoup de cartes
        // partagent la même date de création — sans départage, la pagination répète des lignes.
        orderBy: [
          { [sort]: direction } as Prisma.EcardOrderByWithRelationInput,
          { id: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ecard.count({ where }),
      this.prisma.ecard.aggregate({ where, _sum: { valueDt: true } }),
    ]);

    return {
      items: ecards.map((ecard) => this.toRow(ecard)),
      total,
      page,
      pageSize,
      totalValueDt: moneyToApi(
        sum._sum.valueDt ? money(sum._sum.valueDt) : ZERO_DT,
      ),
    };
  }

  async getOne(ecardId: number): Promise<EcardAdminDetailDto> {
    const ecard = await this.prisma.ecard.findUnique({
      where: { id: ecardId },
      include: {
        ...ROW_INCLUDE,
        ledgerEntries: { orderBy: { id: 'asc' } },
      },
    });
    if (!ecard) {
      throw new NotFoundException(`E-card inconnue : ${ecardId}`);
    }

    return {
      ...this.toRow(ecard),
      ledgerEntries: ecard.ledgerEntries.map((entry) => ({
        id: entry.id,
        memberId: entry.memberId,
        type: entry.type,
        amountDt: moneyToApi(money(entry.amountDt)),
        createdAt: entry.createdAt,
      })),
    };
  }

  private buildWhere(query: AdminEcardsQueryDto): Prisma.EcardWhereInput {
    const code = query.code?.trim();
    return {
      // Égalité STRICTE (pas de `contains`) : une recherche partielle sur un code serait un
      // oracle de devinette. Il faut déjà connaître le code entier pour retrouver la carte.
      ...(code ? { code } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.origin ? { origin: query.origin } : {}),
      ...(query.creatorMemberId ? { creatorId: query.creatorMemberId } : {}),
      ...(query.userMemberId ? { userId: query.userMemberId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  /** Projection vers le DTO admin. Le `code` n'y figure pas — il n'existe pas dans la cible. */
  private toRow(ecard: EcardRow): EcardAdminRowDto {
    const fullName = (person: { firstName: string; lastName: string } | null) =>
      person ? `${person.lastName} ${person.firstName}` : null;

    return {
      id: ecard.id,
      valueDt: moneyToApi(money(ecard.valueDt)),
      status: ecard.status,
      origin: ecard.origin,
      creatorMemberId: ecard.creator?.id ?? null,
      creatorMemberCode: ecard.creator?.memberCode ?? null,
      creatorName: fullName(ecard.creator),
      userMemberId: ecard.user?.id ?? null,
      userMemberCode: ecard.user?.memberCode ?? null,
      userName: fullName(ecard.user),
      createdAt: ecard.createdAt,
      usedAt: ecard.usedAt,
      expiresAt: ecard.expiresAt,
      closedAt: ecard.closedAt,
      orderId: ecard.order?.id ?? null,
      orderContext: ecard.order?.context ?? null,
      membershipPaymentId: ecard.membershipPayment?.id ?? null,
      membershipPaymentType: ecard.membershipPayment?.type ?? null,
    };
  }
}
