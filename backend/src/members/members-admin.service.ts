import { Injectable } from '@nestjs/common';
import { Leg, Prisma } from '@prisma/client';
import { moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivationSnapshotDto,
  MemberDetailDto,
  MemberListItemDto,
  MemberPageDto,
  MemberRefDto,
} from './dto/member-response.dto';
import { AdminMembersQueryDto } from './dto/members-query.dto';
import { MemberNotFoundError } from './members.errors';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Les downlines directs : au plus DEUX lignes (contrainte `@@unique([uplineId, leg])`), donc
 * l'`include` ne peut pas dégénérer — pas de `take` défensif à écrire.
 */
const DOWNLINES_INCLUDE = {
  select: {
    id: true,
    memberCode: true,
    firstName: true,
    lastName: true,
    status: true,
    leg: true,
  },
} satisfies Prisma.Member$downlinesArgs;

const LIST_INCLUDE = {
  pack: { select: { name: true } },
  downlines: DOWNLINES_INCLUDE,
} satisfies Prisma.MemberInclude;

const DETAIL_INCLUDE = {
  pack: { select: { name: true } },
  downlines: DOWNLINES_INCLUDE,
  sponsor: {
    select: {
      id: true,
      memberCode: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
  upline: {
    select: {
      id: true,
      memberCode: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
  // L'auteur du verdict de vérification (Tranche 8c) : un badge sans auteur n'est pas une trace.
  verificationByAdmin: { select: { name: true } },
} satisfies Prisma.MemberInclude;

type MemberForList = Prisma.MemberGetPayload<{ include: typeof LIST_INCLUDE }>;
type MemberForDetail = Prisma.MemberGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;
type DownlineRow = MemberForList['downlines'][number];

/**
 * Lecture des membres pour le back-office (spec §7.2.2). **CONSULTATION SEULE** — ce service
 * n'écrit rien et n'a pas de transaction : l'inscription, l'activation, le gel et la
 * réactivation appartiennent aux services de domaine (`MembersService`, `ActivationService`,
 * `RenewalService`), qui seuls savent verrouiller la chaîne d'ancêtres dans le bon ordre
 * (D-024). Une liste d'affichage n'a aucune raison de prendre un verrou.
 *
 * Aucune règle métier ici non plus : on PROJETTE des colonnes déjà écrites. Les points, le
 * carry-over, les compteurs d'équilibres et le solde sont lus tels quels — le back-office les
 * montre, il ne les recalcule jamais (CLAUDE.md racine).
 *
 * NOTE — « bloquer / débloquer » (§7.2.2) n'est PAS implémenté : aucun concept de blocage
 * n'existe en base, et `MemberStatus.INACTIVE` est le GEL de non-renouvellement (D-034), qu'on
 * ne peut pas détourner sans falsifier le moteur de commissions. Définir ce qu'un blocage
 * interdit est une décision métier — elle est en attente de la cliente (docs/plan.md).
 */
@Injectable()
export class MembersAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminMembersQueryDto = {}): Promise<MemberPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = this.buildWhere(query);

    const [members, total] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: this.buildOrderBy(query),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.member.count({ where }),
    ]);

    return {
      items: members.map((member) => this.toListItem(member)),
      total,
      page,
      pageSize,
    };
  }

  async getOne(memberId: number): Promise<MemberDetailDto> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: DETAIL_INCLUDE,
    });
    if (!member) {
      throw new MemberNotFoundError(memberId);
    }
    return this.toDetail(member);
  }

  /**
   * Chemin RELATIF du document d'identité, pour la route qui le sert. Isolé ici parce que
   * c'est la seule lecture de `idDocumentPath` du projet : la colonne ne sort d'aucune autre
   * requête, et surtout d'aucune vue d'API.
   */
  async getIdDocumentPath(memberId: number): Promise<string | null> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { idDocumentPath: true },
    });
    if (!member) {
      throw new MemberNotFoundError(memberId);
    }
    return member.idDocumentPath;
  }

  // ─────────────────────────── Interne ───────────────────────────

  private buildWhere(query: AdminMembersQueryDto): Prisma.MemberWhereInput {
    const registeredAt = this.buildPeriod(
      query.registeredFrom,
      query.registeredTo,
    );

    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.packId ? { packId: query.packId } : {}),
      ...(query.verificationStatus
        ? { verificationStatus: query.verificationStatus }
        : {}),
      ...(registeredAt ? { registeredAt } : {}),
      ...(query.search ? { OR: this.buildSearch(query.search) } : {}),
    };
  }

  /**
   * Période d'inscription. La borne haute est INCLUSE au sens de l'utilisateur : « jusqu'au
   * 31/12 » doit contenir le 31 décembre en entier. Une date nue (`2026-12-31`) est lue par
   * `Date` comme minuit — la comparer en `lte` exclurait toute la journée. On passe donc au
   * jour suivant, exclu.
   */
  private buildPeriod(
    from?: string,
    to?: string,
  ): Prisma.DateTimeFilter | undefined {
    if (!from && !to) {
      return undefined;
    }
    const filter: Prisma.DateTimeFilter = {};
    if (from) {
      filter.gte = new Date(from);
    }
    if (to) {
      const end = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        end.setUTCDate(end.getUTCDate() + 1);
        filter.lt = end;
      } else {
        filter.lte = end;
      }
    }
    return filter;
  }

  private buildSearch(search: string): Prisma.MemberWhereInput[] {
    const term = search.trim();
    const contains = { contains: term, mode: 'insensitive' } as const;
    return [
      { memberCode: contains },
      { firstName: contains },
      { lastName: contains },
      { email: contains },
      { phone: contains },
    ];
  }

  /**
   * Tri toujours DÉPARTAGÉ par `id` : `registeredAt` ou `status` ne sont pas uniques, et un
   * `ORDER BY` non total laisse Postgres libre de renvoyer deux lignes ex æquo dans un ordre
   * différent d'une page à l'autre — un membre apparaîtrait deux fois, un autre jamais.
   */
  private buildOrderBy(
    query: AdminMembersQueryDto,
  ): Prisma.MemberOrderByWithRelationInput[] {
    const direction = query.direction ?? 'desc';
    const field = query.sort ?? 'id';
    if (field === 'id') {
      return [{ id: direction }];
    }
    return [{ [field]: direction }, { id: direction }];
  }

  private findLeg(downlines: DownlineRow[], leg: Leg): MemberRefDto | null {
    const found = downlines.find((downline) => downline.leg === leg);
    return found ? this.toRef(found) : null;
  }

  private toRef(member: {
    id: number;
    memberCode: string;
    firstName: string;
    lastName: string;
    status: MemberForList['status'];
  }): MemberRefDto {
    return {
      id: member.id,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      status: member.status,
    };
  }

  /**
   * Lecture DÉFENSIVE du snapshot d'activation. La colonne est du `Json` libre : elle porte la
   * forme qui avait cours au moment de l'activation, et le back-office n'a aucun moyen de la
   * refuser après coup. Les activations d'avant D-028 y ont figé `weeklyCapBv`,
   * `directCommissionBv`, `indirectCommissionBv` — un plan de rémunération que l'on croyait
   * alors libellé en POINTS — et rien d'autre : ni prix, ni acompte, ni montant dû.
   *
   * On ne retient donc QUE les clés présentes et bien formées. Le reste sort `null` :
   *  — pas de conversion `…Bv → …Dt` : elle inventerait un taux points↔dinars qui n'existe pas ;
   *  — pas de relecture du `Pack` courant : le snapshot vaut parce qu'il ne suit pas le pack.
   *
   * Le service ne « répare » rien en base non plus : réécrire ces sept lignes effacerait la
   * seule trace de ce qui a réellement été figé, et ne protégerait pas la route du prochain
   * snapshot inattendu. Ici, l'absence est une réponse — et c'est la réponse honnête.
   */
  private toActivationSnapshot(
    raw: Prisma.JsonValue | null,
  ): ActivationSnapshotDto | null {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const snapshot = raw as Record<string, unknown>;
    const text = (key: string): string | null =>
      typeof snapshot[key] === 'string' ? (snapshot[key] as string) : null;
    const count = (key: string): number | null =>
      typeof snapshot[key] === 'number' && Number.isFinite(snapshot[key])
        ? (snapshot[key] as number)
        : null;

    return {
      packName: text('packName'),
      tierBv: count('tierBv'),
      priceDt: text('priceDt'),
      registrationCreditDt: text('registrationCreditDt'),
      amountDueDt: text('amountDueDt'),
      directCommissionDt: text('directCommissionDt'),
      indirectCommissionDt: text('indirectCommissionDt'),
      weeklyCapDt: text('weeklyCapDt'),
    };
  }

  private toListItem(member: MemberForList): MemberListItemDto {
    return {
      id: member.id,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      status: member.status,
      packName: member.pack?.name ?? null,
      balanceDt: moneyToApi(member.balanceDt),
      leftDownline: this.findLeg(member.downlines, Leg.LEFT),
      rightDownline: this.findLeg(member.downlines, Leg.RIGHT),
      registeredAt: member.registeredAt,
      activatedAt: member.activatedAt,
      verificationStatus: member.verificationStatus,
    };
  }

  private toDetail(member: MemberForDetail): MemberDetailDto {
    return {
      id: member.id,
      memberCode: member.memberCode,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      status: member.status,
      registeredAt: member.registeredAt,
      activatedAt: member.activatedAt,
      renewalAt: member.renewalAt,

      idDocumentType: member.idDocumentType,
      idDocumentNumber: member.idDocumentNumber,
      // Le CHEMIN ne sort pas : seul le fait qu'un document existe est une information d'API.
      hasIdDocument: member.idDocumentPath !== null,
      verificationStatus: member.verificationStatus,
      verificationReason: member.verificationReason,
      verificationAt: member.verificationAt,
      verificationByAdminId: member.verificationByAdminId,
      verificationByAdminName: member.verificationByAdmin?.name ?? null,

      packId: member.packId,
      packName: member.pack?.name ?? null,
      activationTierBv: member.activationTierBv,
      activationSnapshot: this.toActivationSnapshot(member.activationSnapshot),

      sponsor: member.sponsor ? this.toRef(member.sponsor) : null,
      upline: member.upline ? this.toRef(member.upline) : null,
      leg: member.leg,
      leftDownline: this.findLeg(member.downlines, Leg.LEFT),
      rightDownline: this.findLeg(member.downlines, Leg.RIGHT),

      leftPoints: member.leftPoints,
      rightPoints: member.rightPoints,
      baselineLeft: member.baselineLeft,
      baselineRight: member.baselineRight,
      carriedLeftPoints: member.carriedLeftPoints,
      carriedRightPoints: member.carriedRightPoints,

      balanceDt: moneyToApi(member.balanceDt),
      registrationPaidDt: moneyToApi(member.registrationPaidDt),

      lifetimeBalanceCount: member.lifetimeBalanceCount,
      startupBonusUsed: member.startupBonusUsed,
      rewardPoints: member.rewardPoints,
      activatedDescendants: member.activatedDescendants,
    };
  }
}
