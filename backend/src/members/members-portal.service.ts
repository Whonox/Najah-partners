import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EcardStatus,
  Leg,
  MemberStatus,
  MembershipPaymentType,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { nextClosingAt } from '../commissions/period';
import { ZERO_DT, money, moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  ANNUAL_RENEWAL_SETTING,
  MembershipFeeService,
} from './membership-fee.service';
import { DownlinesQueryDto } from './dto/portal-query.dto';
import {
  DownlinePageDto,
  DownlineRowDto,
  MemberDashboardDto,
  MemberProfileDto,
  MemberRenewalStateDto,
} from './dto/portal-response.dto';
import { UpdateMemberProfileDto } from './dto/update-profile.dto';

const DEFAULT_PAGE_SIZE = 20;
/**
 * Même garde-fou que toutes les traversées d'arbre du projet (`.claude/rules/tree.md`) : une
 * corruption de données ne doit jamais produire une récursion infinie.
 */
const MAX_TREE_DEPTH = 1000;
const BCRYPT_ROUNDS = 10;

/** Ligne brute de la CTE de sous-arbre (les `count` sont castés `::int` — un bigint casse le JSON). */
interface DownlineRow {
  id: number;
  memberCode: string;
  firstName: string;
  lastName: string;
  status: MemberStatus;
  packName: string | null;
  depth: number;
  rootLeg: Leg;
  leg: Leg | null;
  activatedAt: Date | null;
  contributedPoints: number | null;
  isDirectReferral: boolean;
  total: number;
}

/**
 * Surface AFFILIÉ (spec §7.1). Service de LECTURE, à deux exceptions près (profil, mot de
 * passe) : il ne décide aucune règle métier, il rend ce que d'autres ont écrit — une
 * activation, un run, un paiement. Le portail affiche et déclenche ; le backend calcule.
 *
 * ═══ CLOISONNEMENT ═══
 * Toutes les méthodes prennent le `memberId` du TOKEN. Aucune route de ce module n'accepte
 * d'identifiant de membre en paramètre d'URL ou de corps : il n'existe donc pas de requête,
 * même forgée, par laquelle un membre lirait les données d'un autre. Ce qui traverse quand
 * même la frontière — la liste des downlines — est réduit à ce qui touche À MON ARBRE
 * (position, état, points injectés) : ni coordonnées, ni solde, ni e-cards d'autrui.
 *
 * ═══ DEUX DIMENSIONS (D-028) ═══
 * Les points de l'arbre (`Int`) et les dinars du portefeuille (`Decimal(12,3)`) ne se croisent
 * nulle part dans ce fichier. Aucune addition, aucun ratio, aucune conversion : il n'en existe
 * pas dans le modèle.
 */
@Injectable()
export class MembersPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: MembershipFeeService,
  ) {}

  // ─────────────────────────── Profil (§7.1.7) ───────────────────────────

  async profile(memberId: number): Promise<MemberProfileDto> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: {
        pack: { select: { name: true } },
        sponsor: { select: LINK_SELECT },
        upline: { select: LINK_SELECT },
      },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable.');
    }

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
      // Le pack RENDU est le SNAPSHOT d'activation, jamais le pack vivant (§5.8) : c'est lui
      // que le moteur applique. Afficher les valeurs courantes ferait promettre à l'écran un
      // plafond ou une commission que ce membre n'aura jamais.
      pack: this.readSnapshot(member.activationSnapshot, member.activationTierBv),
      sponsor: member.sponsor,
      upline: member.upline,
      leg: member.leg,
      registrationPaidDt: moneyToApi(money(member.registrationPaidDt)),
      verification: {
        status: member.verificationStatus,
        documentType: member.idDocumentType,
        documentNumber: member.idDocumentNumber,
        reason: member.verificationReason,
        decidedAt: member.verificationAt,
      },
      renewal: await this.renewalState(memberId, member.renewalAt),
    };
  }

  /**
   * Mise à jour du profil. N'accepte QUE le nom et le prénom : l'e-mail et le téléphone sont
   * des identifiants de connexion et sont absents du DTO (D-049 — voir `UpdateMemberProfileDto`).
   */
  async updateProfile(
    memberId: number,
    dto: UpdateMemberProfileDto,
  ): Promise<MemberProfileDto> {
    const data: Prisma.MemberUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();

    if (Object.keys(data).length > 0) {
      await this.prisma.member.update({ where: { id: memberId }, data });
    }
    return this.profile(memberId);
  }

  /**
   * Changement de mot de passe. Le mot de passe actuel est EXIGÉ (preuve de possession), et
   * toutes les sessions sont RÉVOQUÉES : sans cela, un jeton de rafraîchissement déjà émis —
   * y compris celui d'un intrus — survivrait au changement pendant des jours, ce qui viderait
   * l'opération de son sens. Le membre se reconnecte, c'est le prix, et il est juste.
   */
  async changePassword(
    memberId: number,
    dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { passwordHash: true },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable.');
    }
    const ok = await bcrypt.compare(dto.currentPassword, member.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Mot de passe actuel incorrect.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await tx.member.update({ where: { id: memberId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { memberId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { success: true };
  }

  // ─────────────────────────── Tableau de bord (§7.1.1) ───────────────────────────

  async dashboard(
    memberId: number,
    now: Date = new Date(),
  ): Promise<MemberDashboardDto> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: { pack: { select: { name: true } } },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable.');
    }

    const [subtree, referralCount, ecards, earned, lastCommission, pending] =
      await Promise.all([
        this.countSubtree(memberId),
        this.prisma.member.count({ where: { sponsorId: memberId } }),
        this.prisma.ecard.aggregate({
          where: { creatorId: memberId, status: EcardStatus.ACTIVE },
          _count: { _all: true },
          _sum: { valueDt: true },
        }),
        this.prisma.commission.aggregate({
          where: { memberId },
          _sum: { paidDt: true },
        }),
        this.prisma.commission.findFirst({
          where: { memberId },
          orderBy: { runId: 'desc' },
          include: { run: { select: { periodEnd: true } } },
        }),
        // Ce que le PROCHAIN run examinera : les événements non encore réclamés (`runId IS
        // NULL`). Seuls les ÉLIGIBLES sont comptés — un événement né chez un gelé est tracé
        // mais ne sera jamais payé (D-034), l'annoncer serait une promesse fausse.
        this.prisma.commissionEvent.aggregate({
          where: { memberId, runId: null, eligible: true },
          _count: { _all: true },
          _sum: { amountDt: true },
        }),
      ]);

    const snapshot = this.readSnapshot(
      member.activationSnapshot,
      member.activationTierBv,
    );

    return {
      balanceDt: moneyToApi(money(member.balanceDt)),
      lifetimeEarnedDt: moneyToApi(this.sum(earned._sum.paidDt)),
      lastRun: lastCommission
        ? {
            runId: lastCommission.runId,
            periodEnd: lastCommission.run.periodEnd,
            grossDt: moneyToApi(money(lastCommission.grossDt)),
            paidDt: moneyToApi(money(lastCommission.paidDt)),
            // « Perdu » ne dit qu'une chose : perdu AU PLAFOND (D-033). L'écart brut − versé
            // EST cette perte, par construction du règlement.
            lostDt: moneyToApi(
              money(lastCommission.grossDt).minus(money(lastCommission.paidDt)),
            ),
            rewardPointsGranted: lastCommission.rewardPointsGranted,
          }
        : null,
      pendingGrossDt: moneyToApi(this.sum(pending._sum.amountDt)),
      pendingEventCount: pending._count._all,
      // Calculée depuis la MÊME expression cron que le déclencheur : deux calendriers feraient
      // deux vérités, et l'écran finirait par annoncer un run qui n'a pas lieu.
      nextRunAt: nextClosingAt(now),

      leftPoints: member.leftPoints,
      rightPoints: member.rightPoints,
      carriedLeftPoints: member.carriedLeftPoints,
      carriedRightPoints: member.carriedRightPoints,
      tierBv: member.activationTierBv,

      lifetimeBalanceCount: member.lifetimeBalanceCount,
      rewardPoints: member.rewardPoints,
      startupBonusUsed: member.startupBonusUsed,

      downlineCount: subtree.total,
      activatedDownlineCount: subtree.activated,
      referralCount,

      activeEcardCount: ecards._count._all,
      activeEcardValueDt: moneyToApi(this.sum(ecards._sum.valueDt)),

      status: member.status,
      packName: member.pack?.name ?? snapshot?.packName ?? null,
      renewal: await this.renewalState(memberId, member.renewalAt),
      weeklyCapDt: snapshot?.weeklyCapDt ?? null,
    };
  }

  // ─────────────────────────── Mes downlines (§7.1.6) ───────────────────────────

  /**
   * MON sous-arbre, paginé et filtré, en UNE requête (D-014 : traversée ensembliste, jamais de
   * boucle applicative). `rootLeg` est propagé depuis le premier niveau : il dit de quel côté
   * DE MOI le membre se trouve, ce qui n'est pas la même chose que sa jambe locale sous son
   * propre upline — c'est la confusion que l'écran doit éviter.
   *
   * Le total est ramené par `count(*) OVER ()` plutôt que par une seconde requête : la CTE
   * récursive est la partie coûteuse, la parcourir deux fois pour compter serait payer l'arbre
   * deux fois. Il est casté `::int` — un `bigint` casse la sérialisation JSON bien plus loin.
   */
  async downlines(
    memberId: number,
    query: DownlinesQueryDto = {},
  ): Promise<DownlinePageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const search = query.search?.trim();
    const like = search ? `%${search}%` : null;

    const rows = await this.prisma.$queryRaw<DownlineRow[]>`
      WITH RECURSIVE down AS (
          SELECT ch."id", 1 AS depth, ch."leg" AS "rootLeg"
          FROM "Member" ch
          WHERE ch."uplineId" = ${memberId} AND ch."leg" IS NOT NULL
        UNION ALL
          SELECT c."id", d.depth + 1, d."rootLeg"
          FROM down d
          JOIN "Member" c ON c."uplineId" = d."id"
          WHERE d.depth < ${MAX_TREE_DEPTH}
      )
      SELECT m."id", m."memberCode", m."firstName", m."lastName", m."status",
             p."name" AS "packName",
             d.depth,
             d."rootLeg",
             m."leg",
             m."activatedAt",
             m."activationTierBv" AS "contributedPoints",
             (m."sponsorId" = ${memberId}) AS "isDirectReferral",
             (count(*) OVER ())::int AS total
      FROM down d
      JOIN "Member" m ON m."id" = d."id"
      LEFT JOIN "Pack" p ON p."id" = m."packId"
      WHERE (${like}::text IS NULL
             OR m."memberCode" ILIKE ${like}::text
             OR m."firstName" ILIKE ${like}::text
             OR m."lastName" ILIKE ${like}::text)
        AND (${query.status ?? null}::text IS NULL
             OR m."status"::text = ${query.status ?? null}::text)
        AND (${query.leg ?? null}::text IS NULL
             OR d."rootLeg"::text = ${query.leg ?? null}::text)
        AND (${query.directReferralsOnly ?? false}::boolean IS NOT TRUE
             OR m."sponsorId" = ${memberId})
      ORDER BY d.depth ASC, m."id" ASC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;

    const items: DownlineRowDto[] = rows.map((row) => ({
      id: row.id,
      memberCode: row.memberCode,
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status,
      packName: row.packName,
      depth: row.depth,
      rootLeg: row.rootLeg,
      leg: row.leg,
      activatedAt: row.activatedAt,
      contributedPoints: row.contributedPoints,
      isDirectReferral: row.isDirectReferral,
    }));

    return { items, total: rows[0]?.total ?? 0, page, pageSize };
  }

  // ─────────────────────────── Helpers ───────────────────────────

  /** Taille de mon sous-arbre, et combien y ont ACTIVÉ — d'une seule traversée, donc cohérents. */
  private async countSubtree(
    memberId: number,
  ): Promise<{ total: number; activated: number }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ total: number; activated: number }>
    >`
      WITH RECURSIVE down AS (
          SELECT ch."id", ch."activatedAt", 1 AS depth
          FROM "Member" ch
          WHERE ch."uplineId" = ${memberId}
        UNION ALL
          SELECT c."id", c."activatedAt", d.depth + 1
          FROM down d
          JOIN "Member" c ON c."uplineId" = d."id"
          WHERE d.depth < ${MAX_TREE_DEPTH}
      )
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE "activatedAt" IS NOT NULL)::int AS activated
      FROM down
    `;
    return rows[0] ?? { total: 0, activated: 0 };
  }

  /**
   * Où en est mon renouvellement (D-038). On rend l'état du DERNIER paiement, car c'est lui qui
   * dit ce qui va se passer : `PENDING_VALIDATION` = payé mais pas encore validé, et le membre
   * gelé le RESTE — payer ne dégèle pas.
   */
  private async renewalState(
    memberId: number,
    renewalAt: Date | null,
  ): Promise<MemberRenewalStateDto> {
    const [last, amountDue] = await Promise.all([
      this.prisma.membershipPayment.findFirst({
        where: { memberId, type: MembershipPaymentType.RENEWAL },
        orderBy: { id: 'desc' },
        select: { status: true, amountDt: true, paidAt: true },
      }),
      // Le tarif COURANT, pour que l'écran sache quelle somme d'e-cards composer. Le montant
      // d'un paiement déjà effectué reste, lui, celui qui a été figé à l'époque.
      this.fees.read(ANNUAL_RENEWAL_SETTING),
    ]);
    return {
      renewalAt,
      amountDueDt: moneyToApi(amountDue),
      lastPaymentStatus: last?.status ?? null,
      lastPaymentAmountDt: last ? moneyToApi(money(last.amountDt)) : null,
      lastPaymentAt: last?.paidAt ?? null,
    };
  }

  /**
   * Relit le snapshot d'activation (Json figé, §5.8). Défensif par nécessité : `activationSnapshot`
   * est un `Json` côté Prisma, donc `unknown` côté TypeScript — le typer par affirmation ferait
   * planter l'écran sur une ligne ancienne ou partielle au lieu de l'afficher sans son pack.
   */
  private readSnapshot(
    raw: Prisma.JsonValue | null,
    tierBv: number | null,
  ): MemberProfileDto['pack'] {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const snap = raw as Record<string, unknown>;
    // `null` et non `0.000` quand le montant est absent : un snapshot d'avant la Tranche 6.5
    // exprimait ses montants en POINTS (`weeklyCapBv`…). Rendre zéro annoncerait « plafond
    // nul » à un membre dont le plafond existe bel et bien — il n'est simplement pas
    // enregistré en dinars. L'écran rend « — », ce qui est la vérité.
    const text = (key: string): string | null =>
      typeof snap[key] === 'string' || typeof snap[key] === 'number'
        ? moneyToApi(money(String(snap[key])))
        : null;

    return {
      packName: typeof snap.packName === 'string' ? snap.packName : '',
      // Le palier fait foi dans sa colonne dédiée (`activationTierBv`) : c'est elle que le
      // moteur lit pour compter les cycles, pas le Json.
      tierBv: tierBv ?? (typeof snap.tierBv === 'number' ? snap.tierBv : 0),
      priceDt: text('priceDt'),
      directCommissionDt: text('directCommissionDt'),
      indirectCommissionDt: text('indirectCommissionDt'),
      weeklyCapDt: text('weeklyCapDt'),
    };
  }

  private sum(value: Prisma.Decimal | null): ReturnType<typeof money> {
    return value ? money(value) : ZERO_DT;
  }
}

const LINK_SELECT = {
  id: true,
  memberCode: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.MemberSelect;
