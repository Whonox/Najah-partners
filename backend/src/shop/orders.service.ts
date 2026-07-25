import { Injectable } from '@nestjs/common';
import { Prisma, ShipmentStatus } from '@prisma/client';
import { moneyToApi } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOrdersQueryDto, OrdersQueryDto } from './dto/orders-query.dto';
import {
  InvalidShipmentTransitionError,
  OrderNotFoundError,
  ShipmentNotApplicableError,
} from './shop.errors';
import { OrderPage, OrderView } from './shop.types';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Une commande avec ses lignes, le nom des produits (le seul champ relu en direct) et les
 * e-cards qui l'ont réglée — leurs IDENTIFIANTS seulement : un code est de la valeur au
 * porteur et ne sort jamais d'une vue de commande.
 */
export const ORDER_INCLUDE = {
  lines: { include: { product: { select: { name: true } } } },
  ecards: { select: { id: true }, orderBy: { id: 'asc' } },
  // Le CODE du membre, pas seulement son id : c'est la clé que l'admin connaît. Trois colonnes
  // en `select`, jamais le membre entier — une commande n'a pas à charrier un solde.
  member: {
    select: { id: true, memberCode: true, firstName: true, lastName: true },
  },
} satisfies Prisma.OrderInclude;

type OrderWithLines = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/**
 * Le colis suit une seule direction (spec §7.2) : on ne « dé-livre » pas, on ne remet pas un
 * envoi en préparation. Chaque étape n'a qu'un successeur légitime.
 */
const NEXT_SHIPMENT: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.PREPARATION]: [ShipmentStatus.SHIPPED],
  [ShipmentStatus.SHIPPED]: [ShipmentStatus.DELIVERED],
  [ShipmentStatus.DELIVERED]: [],
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────── Membre ───────────────────────────

  async listMine(
    memberId: number,
    query: OrdersQueryDto = {},
  ): Promise<OrderPage> {
    return this.paginate({ memberId }, query);
  }

  /** Filtré par `memberId` : un membre ne peut pas lire la commande d'un autre. */
  async getMine(memberId: number, orderId: number): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, memberId },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }
    return this.toView(order);
  }

  // ─────────────────────────── Admin ───────────────────────────

  async listAll(query: AdminOrdersQueryDto = {}): Promise<OrderPage> {
    return this.paginate(
      {
        ...(query.memberId ? { memberId: query.memberId } : {}),
        // Filtre par CODE membre : c'est la seule clé que l'admin ait sous les yeux. Égalité
        // EXACTE, insensible à la casse — un code est un identifiant, pas une recherche
        // plein texte : « NP00004 » ne doit jamais ramener les commandes de « NP000042 ».
        ...(query.memberCode
          ? {
              member: {
                is: {
                  memberCode: {
                    equals: query.memberCode.trim(),
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
            }
          : {}),
        ...(query.context ? { context: query.context } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.shipmentStatus
          ? { shipmentStatus: query.shipmentStatus }
          : {}),
      },
      query,
    );
  }

  async getOne(orderId: number): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }
    return this.toView(order);
  }

  /**
   * Avance le suivi d'expédition (PREPARATION → SHIPPED → DELIVERED). Ne touche NI au BV, NI
   * à la commande elle-même : la valeur a été réglée au checkout, l'expédition n'est qu'un
   * suivi logistique — la livraison et ses frais se règlent hors système (spec §5.7).
   *
   * L'`UPDATE` est gardé sur le statut lu : deux admins qui expédient en même temps ne
   * peuvent pas faire sauter une étape.
   */
  async updateShipment(
    adminId: number,
    orderId: number,
    status: ShipmentStatus,
  ): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, shipmentStatus: true },
    });
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }
    if (order.shipmentStatus === null) {
      throw new ShipmentNotApplicableError(orderId);
    }
    if (!NEXT_SHIPMENT[order.shipmentStatus].includes(status)) {
      throw new InvalidShipmentTransitionError(order.shipmentStatus, status);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: number }>>`
        UPDATE "Order"
        SET "shipmentStatus" = ${status}::"ShipmentStatus"
        WHERE "id" = ${orderId}
          AND "shipmentStatus" = ${order.shipmentStatus!}::"ShipmentStatus"
        RETURNING "id"
      `;
      if (rows.length !== 1) {
        throw new InvalidShipmentTransitionError(
          String(order.shipmentStatus),
          status,
        );
      }
      await tx.auditLog.create({
        data: {
          actor: String(adminId),
          action: 'ORDER_SHIPMENT_UPDATED',
          target: `Order:${orderId}`,
          before: { shipmentStatus: order.shipmentStatus },
          after: { shipmentStatus: status },
        },
      });
      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: ORDER_INCLUDE,
      });
    });

    return this.toView(updated);
  }

  // ─────────────────────────── Interne ───────────────────────────

  private async paginate(
    where: Prisma.OrderWhereInput,
    query: OrdersQueryDto,
  ): Promise<OrderPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items: orders.map((o) => this.toView(o)), total, page, pageSize };
  }

  /**
   * Vue API. Les montants en DT sortent en CHAÎNE à 3 décimales : JSON n'a que des flottants, et
   * un montant qui traverse un `double` peut revenir faux au millime près. Les POINTS, eux,
   * restent des entiers.
   */
  toView(order: OrderWithLines): OrderView {
    return {
      id: order.id,
      memberId: order.memberId,
      member: {
        id: order.member.id,
        memberCode: order.member.memberCode,
        firstName: order.member.firstName,
        lastName: order.member.lastName,
      },
      context: order.context,
      status: order.status,
      totalDt: moneyToApi(order.totalDt),
      totalPoints: order.totalPoints,
      ecardIds: order.ecards.map((ecard) => ecard.id),
      shippingAddress: order.shippingAddress,
      shipmentStatus: order.shipmentStatus,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      lines: order.lines.map((line) => ({
        productId: line.productId,
        productName: line.product.name,
        quantity: line.quantity,
        unitValueBv: line.unitValueBv,
        unitPriceDt: moneyToApi(line.unitPriceDt),
      })),
    };
  }
}
