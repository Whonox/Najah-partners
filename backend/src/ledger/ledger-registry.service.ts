import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZERO_DT, money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  BalancePageDto,
  MovementPageDto,
} from './dto/ledger-registry.dto';
import { BalancesQueryDto, MovementsQueryDto } from './dto/registry-query.dto';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Registre des soldes et journal GLOBAL du grand livre (spec §7.2.8) — LECTURE seule. Les
 * écritures (ajustement, genèse) restent dans `LedgerAdminService`, qui seul sait verrouiller la
 * ligne du membre et tracer l'audit dans la même transaction.
 *
 * Les deux réponses portent un TOTAL calculé sur le filtre entier, pas sur la page : « la somme
 * des soldes des membres gelés » est précisément le genre de question qu'on pose à un registre,
 * et l'additionner à la main page par page produirait un faux dès la deuxième page.
 */
@Injectable()
export class LedgerRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async balances(query: BalancesQueryDto = {}): Promise<BalancePageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const search = query.search?.trim();

    const where: Prisma.MemberWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.withBalanceOnly ? { balanceDt: { gt: 0 } } : {}),
      ...(search
        ? {
            OR: [
              { memberCode: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sort = query.sort ?? 'balanceDt';
    const direction = query.direction ?? 'desc';
    // `id` en second critère : deux soldes égaux (fréquent à 0) doivent garder un ordre STABLE,
    // sinon la même ligne peut apparaître sur deux pages consécutives.
    const orderBy: Prisma.MemberOrderByWithRelationInput[] = [
      { [sort]: direction } as Prisma.MemberOrderByWithRelationInput,
      { id: 'asc' },
    ];

    const [members, total, sum] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          memberCode: true,
          firstName: true,
          lastName: true,
          status: true,
          balanceDt: true,
          _count: { select: { ledgerEntries: true } },
          ledgerEntries: {
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.member.count({ where }),
      this.prisma.member.aggregate({ where, _sum: { balanceDt: true } }),
    ]);

    return {
      items: members.map((member) => ({
        memberId: member.id,
        memberCode: member.memberCode,
        firstName: member.firstName,
        lastName: member.lastName,
        status: member.status,
        balanceDt: moneyToApi(money(member.balanceDt)),
        movementCount: member._count.ledgerEntries,
        lastMovementAt: member.ledgerEntries[0]?.createdAt ?? null,
      })),
      total,
      page,
      pageSize,
      totalBalanceDt: moneyToApi(
        sum._sum.balanceDt ? money(sum._sum.balanceDt) : ZERO_DT,
      ),
    };
  }

  async movements(query: MovementsQueryDto = {}): Promise<MovementPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const search = query.search?.trim();

    const where: Prisma.LedgerEntryWhereInput = {
      ...(query.memberId ? { memberId: query.memberId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            member: {
              OR: [
                { memberCode: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { firstName: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [entries, total, sum] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where,
        include: {
          member: {
            select: {
              id: true,
              memberCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ledgerEntry.count({ where }),
      this.prisma.ledgerEntry.aggregate({ where, _sum: { amountDt: true } }),
    ]);

    return {
      items: entries.map((entry) => ({
        id: entry.id,
        member: entry.member,
        type: entry.type,
        amountDt: moneyToApi(money(entry.amountDt)),
        balanceAfterDt: moneyToApi(money(entry.balanceAfterDt)),
        ecardId: entry.ecardId,
        commissionId: entry.commissionId,
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
      total,
      page,
      pageSize,
      netAmountDt: moneyToApi(
        sum._sum.amountDt ? money(sum._sum.amountDt) : ZERO_DT,
      ),
    };
  }
}
