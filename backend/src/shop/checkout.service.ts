import { Injectable } from '@nestjs/common';
import {
  MemberStatus,
  OrderContext,
  OrderStatus,
  Prisma,
  ProductType,
  ShipmentStatus,
} from '@prisma/client';
import { EcardsService } from '../ecards/ecards.service';
import { ActivationService } from '../members/activation.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import {
  CartTierMismatchError,
  EmptyCartError,
  MemberNotActiveError,
  OutOfStockError,
  ProductUnavailableError,
} from './shop.errors';
import { CartItemInput, OrderView, PricedCart, PricedLine } from './shop.types';

const TX_TIMEOUT_MS = 20_000;
/** Échouer proprement plutôt que d'attendre indéfiniment un verrou (branche d'arbre, produit). */
const LOCK_TIMEOUT = "SET LOCAL lock_timeout = '3s'";

/**
 * Checkout (spec §5.6, §5.7, §7.1.4). Deux contextes, une seule règle de paiement.
 *
 * ── Ce que le BV dû vaut, et ne vaut pas ────────────────────────────────────────────────
 * `dueBv = Σ (valeur BV × quantité)`. Rien d'autre n'y entre JAMAIS :
 *   - les frais de livraison sont de l'affichage, réglés hors système (spec §5.7) ;
 *   - une promotion baisse le prix DT affiché et laisse le BV intact (D-002).
 * Ils ne sont pas « exclus du calcul » par vigilance : ils sont d'une autre nature. Le BV est
 * la seule unité transactionnelle ; le dinar ne franchit jamais la frontière du système.
 *
 * ── Effet réseau ────────────────────────────────────────────────────────────────────────
 * ACTIVATION : le panier vaut EXACTEMENT le palier (D-006), l'e-card paie ce palier, et
 * l'activation — elle seule — injecte le BV dans l'arbre (D-005).
 * LIBRE      : aucun point dans l'arbre, aucun BV crédité au membre, aucune ligne de grand
 * livre. L'e-card est brûlée en payant : sa valeur quitte le système (D-025).
 *
 * ── Verrouillage (D-024) : `Member` → `Ecard` → `Product` → INSERT `Order` ───────────────
 * L'activation impose déjà `Member` (chaîne d'ancêtres, ids croissants) puis `Ecard`. Le
 * produit vient APRÈS : aucun autre chemin du système ne verrouille un produit, ajouter
 * `Product` en queue ne peut donc fermer aucun cycle d'attente. Entre deux checkouts aux
 * paniers qui se recoupent, les produits sont verrouillés dans l'ordre des ids croissants —
 * ordre total commun, donc aucun interblocage. Les INSERT finaux ne prennent que des
 * `FOR KEY SHARE` sur les lignes déjà verrouillées : compatibles avec `FOR NO KEY UPDATE`.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activation: ActivationService,
    private readonly ecards: EcardsService,
    private readonly orders: OrdersService,
  ) {}

  // ─────────────────────────── Checkout ACTIVATION ───────────────────────────

  /**
   * Achat d'activation d'un membre INSCRIT (spec §7.1.4a) : commande + consommation de
   * l'e-card + activation + propagation d'arbre + stock, dans UNE transaction. Un échec à
   * n'importe quelle étape annule tout : l'e-card reste `ACTIVE`, le membre reste `INSCRIT`,
   * le stock est intact, et aucune commande orpheline ne subsiste.
   */
  async activationCheckout(input: {
    memberId: number;
    packId: number;
    items: CartItemInput[];
    ecardCode: string;
    shippingAddress?: string;
  }): Promise<OrderView> {
    const cart = this.normalizeCart(input.items);

    // Courtoisie, pas autorité : rejeter tout de suite un panier qui ne fait pas le palier,
    // sans avoir immobilisé une branche entière de l'arbre. Le contrôle qui FAIT FOI est
    // celui d'après, contre le snapshot relu sous verrou.
    await this.precheckTier(input.packId, cart);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(LOCK_TIMEOUT);

        // 1. ACTIVATION — première instruction sous verrou (D-024) : elle verrouille la chaîne
        //    d'ancêtres (`Member`, ids croissants) puis brûle l'e-card (`Ecard`) pour payer le
        //    palier SNAPSHOTÉ. Rien d'autre ne doit être verrouillé avant elle.
        const activated = await this.activation.activateInTx(tx, {
          memberId: input.memberId,
          packId: input.packId,
          payment: this.ecards.activationPayment(input.ecardCode),
        });

        // 2. Le panier doit valoir EXACTEMENT le palier (D-006) — comparé au palier figé au
        //    snapshot, pas au palier vivant du pack : c'est celui-là que l'e-card a payé et
        //    que l'arbre a reçu. Un écart ici annule toute l'activation.
        const priced = await this.priceCartInTx(tx, cart);
        if (priced.totalBv !== activated.snapshot.tierBv) {
          throw new CartTierMismatchError(
            priced.totalBv,
            activated.snapshot.tierBv,
            activated.snapshot.packName,
          );
        }

        // 3. Stock (`Product`) — après `Member` et `Ecard`, conformément à l'ordre D-024.
        await this.reserveStockInTx(tx, priced);

        return this.createOrderInTx(tx, {
          memberId: input.memberId,
          context: OrderContext.ACTIVATION,
          priced,
          ecardId: activated.payment.ecardId,
          shippingAddress: input.shippingAddress,
        });
      },
      { timeout: TX_TIMEOUT_MS },
    );
  }

  // ─────────────────────────── Checkout ACHAT LIBRE ───────────────────────────

  /**
   * Achat libre d'un membre ACTIF (spec §5.7, §7.1.4b). AUCUN effet réseau : pas de
   * propagation dans l'arbre (D-005), pas de mouvement de grand livre (D-025) — le membre
   * n'est ni crédité ni débité, l'e-card paie et disparaît.
   */
  async freeCheckout(input: {
    memberId: number;
    items: CartItemInput[];
    ecardCode: string;
    shippingAddress?: string;
  }): Promise<OrderView> {
    const cart = this.normalizeCart(input.items);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(LOCK_TIMEOUT);

        // 1. `Member` d'abord (D-024), même sans écriture de solde : c'est l'ordre du projet,
        //    et le verrou fige le statut le temps de la commande.
        const rows = await tx.$queryRaw<Array<{ status: MemberStatus }>>`
          SELECT "status" FROM "Member" WHERE "id" = ${input.memberId} FOR NO KEY UPDATE
        `;
        if (rows.length === 0 || rows[0].status !== MemberStatus.ACTIVE) {
          throw new MemberNotActiveError(
            input.memberId,
            rows[0]?.status ?? MemberStatus.REGISTERED,
          );
        }

        // 2. Chiffrage du panier (lecture seule) : il donne le montant dû, que l'e-card doit
        //    couvrir EXACTEMENT. Le chiffrage précède donc forcément la consommation.
        const priced = await this.priceCartInTx(tx, cart);

        // 3. `Ecard` : brûlée pour `totalBv` — valeur différente = refus (D-007).
        const consumed = await this.ecards.consumeInTx(tx, {
          code: input.ecardCode,
          memberId: input.memberId,
          dueBv: priced.totalBv,
        });

        // 4. `Product` : le décrément gardé revérifie la valeur BV lue à l'étape 2 — un produit
        //    revalorisé entre-temps ferait payer l'e-card au mauvais prix, donc on annule.
        await this.reserveStockInTx(tx, priced);

        return this.createOrderInTx(tx, {
          memberId: input.memberId,
          context: OrderContext.FREE,
          priced,
          ecardId: consumed.ecardId,
          shippingAddress: input.shippingAddress,
        });
      },
      { timeout: TX_TIMEOUT_MS },
    );
  }

  // ─────────────────────────── Panier ───────────────────────────

  /**
   * Fusionne les quantités d'un même produit et TRIE PAR ID CROISSANT — ce n'est pas
   * cosmétique : c'est l'ordre dans lequel les produits seront verrouillés (D-024). Deux
   * checkouts concurrents aux paniers qui se recoupent les prennent donc dans le même ordre.
   */
  private normalizeCart(items: CartItemInput[]): CartItemInput[] {
    if (items.length === 0) {
      throw new EmptyCartError();
    }
    const merged = new Map<number, number>();
    for (const item of items) {
      merged.set(
        item.productId,
        (merged.get(item.productId) ?? 0) + item.quantity,
      );
    }
    return [...merged.entries()]
      .map(([productId, quantity]) => ({ productId, quantity }))
      .sort((a, b) => a.productId - b.productId);
  }

  /**
   * Chiffre le panier DANS la transaction : c'est ici que sont figés `unitValueBv` (BV, la
   * seule valeur transactionnelle) et `unitPriceDt` (prix effectif affiché, promo comprise).
   * Lecture seule — aucun verrou n'est pris ici : le verrou de produit vient au décrément,
   * après l'e-card (D-024).
   */
  private async priceCartInTx(
    tx: Prisma.TransactionClient,
    cart: CartItemInput[],
  ): Promise<PricedCart> {
    const products = await tx.product.findMany({
      where: { id: { in: cart.map((i) => i.productId) } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines: PricedLine[] = [];
    let totalBv = 0;
    let hasPhysical = false;

    for (const item of cart) {
      const product = byId.get(item.productId);
      if (!product || !product.active) {
        throw new ProductUnavailableError(item.productId);
      }
      // Le prix DT affiché est le prix promo s'il existe (D-002 : affichage seul). La valeur
      // BV, elle, est la même avec ou sans promo — c'est tout l'objet de la règle.
      const unitPriceDt = product.promoPriceDt ?? product.priceDt;
      lines.push({
        productId: product.id,
        name: product.name,
        type: product.type,
        quantity: item.quantity,
        unitValueBv: product.valueBv,
        unitPriceDt: unitPriceDt.toString(),
      });
      totalBv += product.valueBv * item.quantity;
      hasPhysical ||= product.type === ProductType.PHYSICAL;
      // `shippingFeeDt` n'est même pas lu : il ne participe à aucun total.
    }

    return { lines, totalBv, hasPhysical };
  }

  /**
   * Décrément ATOMIQUE et gardé du stock, produit par produit, par id CROISSANT (D-024).
   *
   * Une seule instruction par produit fait tout : elle verrouille la ligne, revérifie que le
   * produit est toujours achetable et à la MÊME valeur BV que celle chiffrée (sinon l'e-card
   * paierait au mauvais prix), et n'ôte du stock que si `stock >= quantité`. Zéro ligne
   * rendue = rupture ou produit modifié → on lève, la transaction entière est annulée.
   * Sous concurrence, deux commandes du dernier exemplaire se sérialisent sur le verrou de
   * ligne : la seconde relit le stock committé par la première et échoue. Exactement une
   * passe — jamais un stock négatif, jamais un test-puis-écrit non atomique.
   *
   * Un produit VIRTUEL est illimité : son stock (`null`) n'est pas touché. La ligne est tout
   * de même verrouillée par l'UPDATE, ce qui garde le contrôle de valeur BV valable pour lui
   * aussi.
   */
  private async reserveStockInTx(
    tx: Prisma.TransactionClient,
    priced: PricedCart,
  ): Promise<void> {
    for (const line of priced.lines) {
      const rows = await tx.$queryRaw<Array<{ id: number }>>`
        UPDATE "Product"
        SET "stock" = CASE
              WHEN "type" = 'PHYSICAL'::"ProductType" THEN "stock" - ${line.quantity}
              ELSE "stock"
            END
        WHERE "id" = ${line.productId}
          AND "active" = true
          AND "valueBv" = ${line.unitValueBv}
          AND ("type" = 'VIRTUAL'::"ProductType" OR "stock" >= ${line.quantity})
        RETURNING "id"
      `;
      if (rows.length !== 1) {
        // Rupture, ou produit désactivé / revalorisé entre le chiffrage et ici. On ne
        // distingue les deux que pour le message : les deux annulent la commande.
        const current = await tx.product.findUnique({
          where: { id: line.productId },
          select: { active: true, valueBv: true, stock: true },
        });
        if (
          current?.active &&
          current.valueBv === line.unitValueBv &&
          (current.stock ?? Number.MAX_SAFE_INTEGER) < line.quantity
        ) {
          throw new OutOfStockError(line.productId, line.quantity);
        }
        throw new ProductUnavailableError(line.productId);
      }
    }
  }

  // ─────────────────────────── Commande ───────────────────────────

  /**
   * La commande naît `PAID` : l'e-card est déjà brûlée dans cette même transaction. Il n'y a
   * pas d'état « en attente de paiement » dans ce système — sans passerelle, sans fiat, le
   * paiement est instantané ou la transaction n'existe pas (CHECK `Order_paid_ecard_ck`).
   *
   * `shipmentStatus` n'est posé que s'il y a du physique à expédier : une commande 100 %
   * virtuelle n'a rien à préparer.
   */
  private async createOrderInTx(
    tx: Prisma.TransactionClient,
    input: {
      memberId: number;
      context: OrderContext;
      priced: PricedCart;
      ecardId: number | null;
      shippingAddress?: string;
    },
  ): Promise<OrderView> {
    const order = await tx.order.create({
      data: {
        memberId: input.memberId,
        context: input.context,
        totalBv: input.priced.totalBv,
        ecardId: input.ecardId,
        status: OrderStatus.PAID,
        paidAt: new Date(),
        shippingAddress: input.shippingAddress ?? null,
        shipmentStatus: input.priced.hasPhysical
          ? ShipmentStatus.PREPARATION
          : null,
        lines: {
          create: input.priced.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitValueBv: line.unitValueBv, // snapshot : une revalorisation ultérieure du
            unitPriceDt: new Prisma.Decimal(line.unitPriceDt), // produit ne réécrit pas la commande
          })),
        },
      },
      include: { lines: { include: { product: { select: { name: true } } } } },
    });

    await tx.auditLog.create({
      data: {
        actor: `Member:${input.memberId}`,
        action:
          input.context === OrderContext.ACTIVATION
            ? 'ORDER_ACTIVATION_PAID'
            : 'ORDER_FREE_PAID',
        target: `Order:${order.id}`,
        after: {
          totalBv: order.totalBv,
          ecardId: order.ecardId, // jamais le code en clair (règle e-card)
          lines: input.priced.lines.length,
        },
      },
    });

    return this.orders.toView(order);
  }

  /**
   * Pré-contrôle hors transaction du panier d'activation. Purement défensif : il évite de
   * verrouiller une branche pour un panier manifestement faux. L'autorité reste le contrôle
   * fait sous verrou contre le snapshot (le pack peut changer entre les deux — auquel cas
   * c'est le snapshot qui gagne, et le checkout est annulé).
   */
  private async precheckTier(
    packId: number,
    cart: CartItemInput[],
  ): Promise<void> {
    const [pack, products] = await Promise.all([
      this.prisma.pack.findUnique({ where: { id: packId } }),
      this.prisma.product.findMany({
        where: { id: { in: cart.map((i) => i.productId) } },
        select: { id: true, valueBv: true, active: true },
      }),
    ]);
    if (!pack) {
      return; // Pack inexistant : `activateInTx` lèvera PackUnavailableError, sa responsabilité.
    }
    const byId = new Map(products.map((p) => [p.id, p]));
    let totalBv = 0;
    for (const item of cart) {
      const product = byId.get(item.productId);
      if (!product || !product.active) {
        throw new ProductUnavailableError(item.productId);
      }
      totalBv += product.valueBv * item.quantity;
    }
    if (totalBv !== pack.tierBv) {
      throw new CartTierMismatchError(totalBv, pack.tierBv, pack.name);
    }
  }
}
