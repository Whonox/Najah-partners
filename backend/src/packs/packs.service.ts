import { Injectable } from '@nestjs/common';
import { Pack, Prisma } from '@prisma/client';
import { money, moneyToApi, type Money } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePackDto, PackResponseDto, UpdatePackDto } from './dto/pack.dto';
import {
  PackNameTakenError,
  PackNotFoundError,
  WeeklyCapBelowCommissionError,
} from './packs.errors';

const PACK_INCLUDE = {
  _count: { select: { members: true } },
} satisfies Prisma.PackInclude;

type PackWithCount = Prisma.PackGetPayload<{ include: typeof PACK_INCLUDE }>;

/**
 * Packs — les paliers Silver / Gold / Safari / Diamond (spec §7.2.4, D-028/D-029).
 *
 * DEUX INVARIANTS gouvernent ce service, et ils tirent dans le même sens :
 *
 *  1. **AUCUNE SUPPRESSION.** Il n'existe pas de `delete` ici, et ce n'est pas un oubli :
 *     `Member.packId` référence un pack à vie, et surtout `Member.activationSnapshot` fige
 *     l'histoire d'un pack qui a pu changer depuis. Un pack qu'on ne veut plus vendre se
 *     DÉSACTIVE (`active = false`) — il disparaît du choix d'activation sans réécrire une
 *     seule ligne du passé.
 *
 *  2. **MODIFIER NE RÉÉCRIT RIEN** (snapshot, spec §5.8). Le moteur de commissions lit
 *     `Member.activationSnapshot`, jamais `Pack` en direct : changer un palier, un prix ou un
 *     plafond ici ne vaut QUE pour les activations postérieures. C'est le back-office qui doit
 *     dire cette phrase à l'écran ; le service, lui, se contente de ne pas la trahir.
 *
 * Aucune conversion points ↔ dinars : `tierBv` est un entier de POINTS, tout le reste est du
 * `Decimal` de DINARS, et les deux ne se rencontrent jamais (D-028).
 */
@Injectable()
export class PacksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PackResponseDto[]> {
    const packs = await this.prisma.pack.findMany({
      include: PACK_INCLUDE,
      orderBy: [{ tierBv: 'asc' }, { id: 'asc' }],
    });
    return packs.map((pack) => this.toView(pack));
  }

  async getOne(id: number): Promise<PackResponseDto> {
    const pack = await this.prisma.pack.findUnique({
      where: { id },
      include: PACK_INCLUDE,
    });
    if (!pack) {
      throw new PackNotFoundError(id);
    }
    return this.toView(pack);
  }

  async create(adminId: number, dto: CreatePackDto): Promise<PackResponseDto> {
    const priceDt = money(dto.priceDt);
    const directCommissionDt = money(dto.directCommissionDt);
    const indirectCommissionDt = money(dto.indirectCommissionDt);
    const weeklyCapDt = money(dto.weeklyCapDt);
    this.assertCapCoversCommissions(
      weeklyCapDt,
      directCommissionDt,
      indirectCommissionDt,
    );

    const pack = await this.run(dto.name, () =>
      this.prisma.pack.create({
        data: {
          name: dto.name,
          tierBv: dto.tierBv,
          priceDt,
          directCommissionDt,
          indirectCommissionDt,
          weeklyCapDt,
          active: dto.active ?? true,
        },
        include: PACK_INCLUDE,
      }),
    );

    await this.audit(adminId, 'PACK_CREATED', pack.id, null, pack);
    return this.toView(pack);
  }

  /**
   * Mise à jour PARTIELLE. Le contrôle « plafond ≥ commissions » porte sur les valeurs
   * RÉSULTANTES, pas sur celles du corps de la requête : baisser le seul plafond, ou monter
   * la seule commission directe, peut casser l'invariant sans que la requête ne mentionne
   * l'autre champ.
   */
  async update(
    adminId: number,
    id: number,
    dto: UpdatePackDto,
  ): Promise<PackResponseDto> {
    const before = await this.prisma.pack.findUnique({
      where: { id },
      include: PACK_INCLUDE,
    });
    if (!before) {
      throw new PackNotFoundError(id);
    }

    const data: Prisma.PackUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.tierBv !== undefined) data.tierBv = dto.tierBv;
    if (dto.priceDt !== undefined) data.priceDt = money(dto.priceDt);
    if (dto.directCommissionDt !== undefined)
      data.directCommissionDt = money(dto.directCommissionDt);
    if (dto.indirectCommissionDt !== undefined)
      data.indirectCommissionDt = money(dto.indirectCommissionDt);
    if (dto.weeklyCapDt !== undefined)
      data.weeklyCapDt = money(dto.weeklyCapDt);
    if (dto.active !== undefined) data.active = dto.active;

    this.assertCapCoversCommissions(
      dto.weeklyCapDt === undefined ? before.weeklyCapDt : money(dto.weeklyCapDt),
      dto.directCommissionDt === undefined
        ? before.directCommissionDt
        : money(dto.directCommissionDt),
      dto.indirectCommissionDt === undefined
        ? before.indirectCommissionDt
        : money(dto.indirectCommissionDt),
    );

    const pack = await this.run(dto.name ?? before.name, () =>
      this.prisma.pack.update({
        where: { id },
        data,
        include: PACK_INCLUDE,
      }),
    );

    await this.audit(adminId, 'PACK_UPDATED', id, before, pack);
    return this.toView(pack);
  }

  // ─────────────────────────── Interne ───────────────────────────

  /**
   * Spec §7.2.4 : « plafond ≥ commissions ». Contrôlé sur les DEUX commissions — un plafond
   * qui couvre l'indirecte mais pas la directe rendrait la commission directe impayable en
   * entier, ce qui est exactement le défaut que la règle veut interdire.
   */
  private assertCapCoversCommissions(
    weeklyCapDt: Money,
    directCommissionDt: Money,
    indirectCommissionDt: Money,
  ): void {
    if (weeklyCapDt.lessThan(directCommissionDt)) {
      throw new WeeklyCapBelowCommissionError(
        moneyToApi(weeklyCapDt),
        moneyToApi(directCommissionDt),
        'directe',
      );
    }
    if (weeklyCapDt.lessThan(indirectCommissionDt)) {
      throw new WeeklyCapBelowCommissionError(
        moneyToApi(weeklyCapDt),
        moneyToApi(indirectCommissionDt),
        'indirecte',
      );
    }
  }

  /**
   * `Pack.name` est unique EN BASE. On laisse Postgres trancher plutôt que de pré-vérifier :
   * un `findFirst` suivi d'un `create` laisse une fenêtre entre les deux, où deux requêtes
   * concurrentes passent toutes les deux le contrôle. La contrainte, elle, n'a pas de fenêtre.
   */
  private async run<T>(name: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new PackNameTakenError(name);
      }
      throw error;
    }
  }

  private toView(pack: PackWithCount): PackResponseDto {
    return {
      id: pack.id,
      name: pack.name,
      tierBv: pack.tierBv,
      priceDt: moneyToApi(pack.priceDt),
      directCommissionDt: moneyToApi(pack.directCommissionDt),
      indirectCommissionDt: moneyToApi(pack.indirectCommissionDt),
      weeklyCapDt: moneyToApi(pack.weeklyCapDt),
      active: pack.active,
      memberCount: pack._count.members,
    };
  }

  /** Un pack définit des montants de commission : toute écriture est tracée, nommément. */
  private async audit(
    adminId: number,
    action: string,
    packId: number,
    before: Pack | null,
    after: Pack | null,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actor: String(adminId),
        action,
        target: `Pack:${packId}`,
        before: before ? this.toAuditJson(before) : Prisma.DbNull,
        after: after ? this.toAuditJson(after) : Prisma.DbNull,
      },
    });
  }

  /** Les `Decimal` traversent l'audit en CHAÎNE : un JSON ne doit jamais porter un flottant d'argent. */
  private toAuditJson(pack: Pack): Prisma.InputJsonValue {
    return {
      name: pack.name,
      tierBv: pack.tierBv,
      priceDt: moneyToApi(pack.priceDt),
      directCommissionDt: moneyToApi(pack.directCommissionDt),
      indirectCommissionDt: moneyToApi(pack.indirectCommissionDt),
      weeklyCapDt: moneyToApi(pack.weeklyCapDt),
      active: pack.active,
    };
  }
}
