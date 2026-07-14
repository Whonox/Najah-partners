import { ConfigService } from '@nestjs/config';
import {
  EcardStatus,
  Leg,
  MemberStatus,
  OrderContext,
  OrderStatus,
  Prisma,
  ProductType,
  ShipmentStatus,
} from '@prisma/client';
import { BvMovementType } from '@prisma/client';
import { BvLedgerService } from '../bv-ledger/bv-ledger.service';
import { EcardValueMismatchError } from '../ecards/ecards.errors';
import { EcardsService } from '../ecards/ecards.service';
import { ActivationService } from '../members/activation.service';
import { MemberCodeService } from '../members/member-code.service';
import { MembersService } from '../members/members.service';
import { BalanceActivationPayment } from '../members/payment/balance-activation-payment';
import { PlacementService } from '../members/placement.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';
import {
  CartTierMismatchError,
  InvalidShipmentTransitionError,
  MemberNotActiveError,
  OutOfStockError,
  ShipmentNotApplicableError,
} from './shop.errors';

/**
 * Boutique & checkout contre un VRAI Postgres (docker-compose, 5433). C'est ici — et nulle
 * part ailleurs — que sont vérifiées l'ATOMICITÉ du checkout (rollback), la CONCURRENCE du
 * stock (deux commandes du dernier exemplaire) et la NEUTRALITÉ de l'achat libre (ni point
 * dans l'arbre, ni ligne de grand livre). Lancés par `npm run test:int`.
 */

jest.setTimeout(60_000);

describe('Boutique & checkout — intégration (vrai Postgres)', () => {
  let prisma: PrismaService;
  let ledger: BvLedgerService;
  let members: MembersService;
  let activation: ActivationService;
  let ecards: EcardsService;
  let orders: OrdersService;
  let checkout: CheckoutService;
  let packId: number;
  let tierBv: number;
  let categoryId: number;
  let adminId: number;

  const createdMembers: number[] = [];
  const createdEcards: number[] = [];
  const createdProducts: number[] = [];
  const createdOrders: number[] = [];
  let seq = 0;

  async function createRoot() {
    seq += 1;
    const member = await prisma.$transaction(async (tx) => {
      const memberCode = await new MemberCodeService().allocate(tx);
      return tx.member.create({
        data: {
          memberCode,
          lastName: 'Racine',
          firstName: `S${seq}`,
          email: `shop-root-${Date.now()}-${seq}@test.local`,
          passwordHash: 'x',
          status: MemberStatus.REGISTERED,
        },
        select: { id: true, memberCode: true },
      });
    });
    createdMembers.push(member.id);
    return member;
  }

  async function register(uplineCode: string, leg: Leg) {
    seq += 1;
    const member = await members.register({
      lastName: 'Test',
      firstName: `S${seq}`,
      email: `shop-${Date.now()}-${seq}@test.local`,
      password: 'MotDePasse123!',
      sponsorCode: uplineCode,
      uplineCode,
      leg,
    });
    createdMembers.push(member.id);
    return member;
  }

  /** Membre ACTIF : inscrit, financé par genèse, puis activé sur son solde (T3/T4). */
  async function activeMember(uplineCode: string, leg: Leg) {
    const member = await register(uplineCode, leg);
    await fund(member.id, tierBv);
    await activation.activate({ memberId: member.id, packId });
    return member;
  }

  async function fund(memberId: number, amountBv: number) {
    await ledger.recordMovement({
      memberId,
      type: BvMovementType.ADMIN_GENESIS,
      amountBv,
      reason: 'Test boutique',
    });
  }

  /** E-card de genèse : la valeur exacte, sans avoir à financer un créateur. */
  async function genesisEcard(valueBv: number) {
    const ecard = await ecards.genesis({ adminId, valueBv });
    createdEcards.push(ecard.id);
    return ecard;
  }

  async function createProduct(input: {
    valueBv: number;
    type?: ProductType;
    stock?: number | null;
    priceDt?: number;
    shippingFeeDt?: number;
    promoPriceDt?: number;
  }) {
    seq += 1;
    const type = input.type ?? ProductType.PHYSICAL;
    const product = await prisma.product.create({
      data: {
        name: `Produit test ${seq}`,
        categoryId,
        priceDt: new Prisma.Decimal(input.priceDt ?? 100),
        valueBv: input.valueBv,
        type,
        stock: type === ProductType.VIRTUAL ? null : (input.stock ?? 1000),
        shippingFeeDt: new Prisma.Decimal(input.shippingFeeDt ?? 0),
        promoPriceDt:
          input.promoPriceDt === undefined
            ? null
            : new Prisma.Decimal(input.promoPriceDt),
      },
    });
    createdProducts.push(product.id);
    return product;
  }

  async function track<T extends { id: number }>(
    order: Promise<T>,
  ): Promise<T> {
    const result = await order;
    createdOrders.push(result.id);
    return result;
  }

  const stockOf = async (id: number) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stock;
  const memberRow = async (id: number) =>
    prisma.member.findUniqueOrThrow({ where: { id } });
  const ecardRow = async (id: number) =>
    prisma.ecard.findUniqueOrThrow({ where: { id } });
  const ordersOf = async (memberId: number) =>
    prisma.order.findMany({ where: { memberId } });
  const ledgerOf = async (memberId: number) =>
    prisma.bvLedgerEntry.findMany({ where: { memberId } });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const config = {
      get: jest.fn((key: string, def?: string) =>
        key === 'BCRYPT_ROUNDS' ? '4' : def,
      ),
    } as unknown as ConfigService;

    ledger = new BvLedgerService(prisma);
    const placement = new PlacementService(prisma);
    members = new MembersService(
      prisma,
      config,
      placement,
      new MemberCodeService(),
    );
    activation = new ActivationService(
      prisma,
      placement,
      new BalanceActivationPayment(ledger),
    );
    ecards = new EcardsService(prisma, ledger);
    orders = new OrdersService(prisma);
    checkout = new CheckoutService(prisma, activation, ecards, orders);

    const pack = await prisma.pack.findFirstOrThrow({
      where: { name: 'Silver' },
    });
    packId = pack.id;
    tierBv = pack.tierBv; // 1000

    const admin = await prisma.adminUser.findFirstOrThrow();
    adminId = admin.id;

    const category = await prisma.category.create({
      data: { name: `Catégorie test ${Date.now()}` },
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    const orderIds = [...createdOrders];
    const productIds = [...createdProducts];
    const ecardIds = [...createdEcards];
    const memberIds = [...createdMembers].reverse();
    createdOrders.length = 0;
    createdProducts.length = 0;
    createdEcards.length = 0;
    createdMembers.length = 0;

    // Ordre imposé par les FK : lignes → commandes → produits → mouvements → e-cards → membres.
    await prisma.order.deleteMany({
      where: {
        OR: [
          { id: { in: orderIds } },
          { memberId: { in: memberIds.length ? memberIds : [-1] } },
        ],
      },
    });
    if (productIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    if (memberIds.length > 0) {
      await prisma.bvLedgerEntry.deleteMany({
        where: { memberId: { in: memberIds } },
      });
    }
    if (ecardIds.length > 0) {
      await prisma.bvLedgerEntry.deleteMany({
        where: { ecardId: { in: ecardIds } },
      });
      await prisma.ecard.deleteMany({ where: { id: { in: ecardIds } } });
    }
    if (memberIds.length > 0) {
      for (const id of memberIds) {
        await prisma.member.delete({ where: { id } });
      }
    }
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  // ─────────────────────────── Checkout ACTIVATION ───────────────────────────

  describe('Activation (D-006, D-007)', () => {
    it('panier = palier EXACT → commande PAID, e-card USED, membre ACTIF, arbre crédité, stock décrémenté', async () => {
      const root = await createRoot();
      const member = await register(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10 }); // 4 × 250 = 1000
      const ecard = await genesisEcard(tierBv);

      const order = await track(
        checkout.activationCheckout({
          memberId: member.id,
          packId,
          items: [{ productId: oil.id, quantity: 4 }],
          ecardCode: ecard.code,
          shippingAddress: 'Tunis',
        }),
      );

      expect(order.context).toBe(OrderContext.ACTIVATION);
      expect(order.status).toBe(OrderStatus.PAID);
      expect(order.totalBv).toBe(tierBv);
      expect(order.shipmentStatus).toBe(ShipmentStatus.PREPARATION);
      expect(order.lines[0].unitValueBv).toBe(250); // snapshot figé

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.USED);

      const activated = await memberRow(member.id);
      expect(activated.status).toBe(MemberStatus.ACTIVE);
      expect(activated.activationTierBv).toBe(tierBv);
      // Seule l'activation injecte du BV dans l'arbre (D-005) : l'upline est crédité du palier.
      expect((await memberRow(root.id)).leftPoints).toBe(tierBv);
      // …et le membre lui-même n'est crédité d'AUCUN BV : l'e-card a payé, elle n'a pas rechargé.
      expect(activated.bvBalance).toBe(0);

      expect(await stockOf(oil.id)).toBe(6);
    });

    it('panier ≠ palier → REFUSÉ : e-card ACTIVE, membre INSCRIT, stock intact, aucune commande', async () => {
      const root = await createRoot();
      const member = await register(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10 });
      const ecard = await genesisEcard(tierBv);

      await expect(
        checkout.activationCheckout({
          memberId: member.id,
          packId,
          items: [{ productId: oil.id, quantity: 3 }], // 750 BV ≠ 1000
          ecardCode: ecard.code,
        }),
      ).rejects.toBeInstanceOf(CartTierMismatchError);

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
      expect((await memberRow(member.id)).status).toBe(MemberStatus.REGISTERED);
      expect((await memberRow(root.id)).leftPoints).toBe(0);
      expect(await stockOf(oil.id)).toBe(10);
      expect(await ordersOf(member.id)).toHaveLength(0);
    });

    it('ROLLBACK : un échec en FIN de checkout annule tout — e-card ACTIVE, membre INSCRIT, stock intact', async () => {
      const root = await createRoot();
      const member = await register(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 500, stock: 4 });
      const ecard = await genesisEcard(tierBv);

      // Panne injectée à la toute dernière étape, APRÈS l'activation, la consommation de
      // l'e-card, le décrément de stock et l'INSERT de la commande : c'est le pire moment,
      // celui où tout est « fait ». Rien ne doit survivre.
      const boom = jest.spyOn(orders, 'toView').mockImplementationOnce(() => {
        throw new Error('panne simulée en fin de checkout');
      });

      await expect(
        checkout.activationCheckout({
          memberId: member.id,
          packId,
          items: [{ productId: oil.id, quantity: 2 }], // 1000 BV = palier
          ecardCode: ecard.code,
        }),
      ).rejects.toThrow('panne simulée');
      boom.mockRestore();

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
      expect((await ecardRow(ecard.id)).usedAt).toBeNull();
      const stillRegistered = await memberRow(member.id);
      expect(stillRegistered.status).toBe(MemberStatus.REGISTERED);
      expect(stillRegistered.activatedAt).toBeNull();
      expect((await memberRow(root.id)).leftPoints).toBe(0); // aucun point propagé
      expect(await stockOf(oil.id)).toBe(4); // stock intact
      expect(await ordersOf(member.id)).toHaveLength(0); // aucune commande orpheline
    });

    it('e-card de valeur ≠ palier → refusée (couverture exacte, D-007)', async () => {
      const root = await createRoot();
      const member = await register(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 1000, stock: 5 });
      const ecard = await genesisEcard(tierBv + 500); // trop-perçu : refusé aussi

      await expect(
        checkout.activationCheckout({
          memberId: member.id,
          packId,
          items: [{ productId: oil.id, quantity: 1 }],
          ecardCode: ecard.code,
        }),
      ).rejects.toBeInstanceOf(EcardValueMismatchError);

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
      expect((await memberRow(member.id)).status).toBe(MemberStatus.REGISTERED);
      expect(await stockOf(oil.id)).toBe(5);
    });
  });

  // ─────────────────────────── Checkout ACHAT LIBRE ───────────────────────────

  describe('Achat libre (D-005, D-025)', () => {
    it('e-card = somme EXACTE → commande FREE, AUCUN point dans l’arbre, AUCUN mouvement de grand livre', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10 });
      const ecard = await genesisEcard(750);

      const rootBefore = await memberRow(root.id);
      const ledgerBefore = await ledgerOf(buyer.id);
      const balanceBefore = (await memberRow(buyer.id)).bvBalance;

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 3 }], // 750 BV
          ecardCode: ecard.code,
        }),
      );

      expect(order.context).toBe(OrderContext.FREE);
      expect(order.totalBv).toBe(750);
      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.USED);
      expect(await stockOf(oil.id)).toBe(7);

      // L'achat de produits n'alimente PAS l'arbre (D-005) : rien n'a bougé chez l'upline.
      const rootAfter = await memberRow(root.id);
      expect(rootAfter.leftPoints).toBe(rootBefore.leftPoints);
      expect(rootAfter.rightPoints).toBe(rootBefore.rightPoints);

      // L'e-card paie, elle ne recharge pas (D-025) : le grand livre du membre est INCHANGÉ.
      expect(await ledgerOf(buyer.id)).toHaveLength(ledgerBefore.length);
      expect((await memberRow(buyer.id)).bvBalance).toBe(balanceBefore);
    });

    it('e-card ≠ somme du panier → refusée, stock intact', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10 });
      const ecard = await genesisEcard(500); // le panier vaudra 750

      await expect(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 3 }],
          ecardCode: ecard.code,
        }),
      ).rejects.toBeInstanceOf(EcardValueMismatchError);

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
      expect(await stockOf(oil.id)).toBe(10);
    });

    it('membre INSCRIT → achat libre refusé (réservé aux ACTIFS)', async () => {
      const root = await createRoot();
      const member = await register(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10 });
      const ecard = await genesisEcard(250);

      await expect(
        checkout.freeCheckout({
          memberId: member.id,
          items: [{ productId: oil.id, quantity: 1 }],
          ecardCode: ecard.code,
        }),
      ).rejects.toBeInstanceOf(MemberNotActiveError);

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
    });
  });

  // ─────────────────────────── Frais de livraison & promo ───────────────────────────

  describe('Le dinar n’entre jamais dans le montant dû (D-002)', () => {
    it('frais de livraison : affichés, jamais ajoutés au montant BV dû', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      // 40 DT de frais de livraison : ils ne doivent RIEN changer au montant dû.
      const oil = await createProduct({
        valueBv: 500,
        stock: 10,
        priceDt: 190,
        shippingFeeDt: 40,
      });
      const ecard = await genesisEcard(1000); // exactement 2 × 500 BV

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 2 }],
          ecardCode: ecard.code,
          shippingAddress: 'Sfax',
        }),
      );

      expect(order.totalBv).toBe(1000); // et non « 1000 + quelque chose »
      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.USED);
    });

    it('promo : le prix DT baisse, la valeur BV ne bouge pas', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const oil = await createProduct({
        valueBv: 500,
        stock: 10,
        priceDt: 190,
        promoPriceDt: 169,
      });
      const ecard = await genesisEcard(500); // le BV dû est le même, promo ou pas

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 1 }],
          ecardCode: ecard.code,
        }),
      );

      expect(order.totalBv).toBe(500);
      expect(order.lines[0].unitValueBv).toBe(500); // BV : inchangé
      expect(order.lines[0].unitPriceDt).toBe('169'); // DT : le prix promo, snapshoté
    });
  });

  // ─────────────────────────── Stock ───────────────────────────

  describe('Stock', () => {
    it('CONCURRENCE : deux commandes du DERNIER exemplaire → exactement une réussit', async () => {
      const root = await createRoot();
      const buyerA = await activeMember(root.memberCode, Leg.LEFT);
      const buyerB = await activeMember(root.memberCode, Leg.RIGHT);
      const rare = await createProduct({ valueBv: 250, stock: 1 });
      const ecardA = await genesisEcard(250);
      const ecardB = await genesisEcard(250);

      const results = await Promise.allSettled([
        checkout.freeCheckout({
          memberId: buyerA.id,
          items: [{ productId: rare.id, quantity: 1 }],
          ecardCode: ecardA.code,
        }),
        checkout.freeCheckout({
          memberId: buyerB.id,
          items: [{ productId: rare.id, quantity: 1 }],
          ecardCode: ecardB.code,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(OutOfStockError);

      // Le stock n'est jamais passé sous zéro, et le perdant n'a rien consommé.
      expect(await stockOf(rare.id)).toBe(0);
      const ecardStatuses = [
        (await ecardRow(ecardA.id)).status,
        (await ecardRow(ecardB.id)).status,
      ];
      expect(ecardStatuses.filter((s) => s === EcardStatus.USED)).toHaveLength(
        1,
      );
      expect(
        ecardStatuses.filter((s) => s === EcardStatus.ACTIVE),
      ).toHaveLength(1);

      const allOrders = [
        ...(await ordersOf(buyerA.id)),
        ...(await ordersOf(buyerB.id)),
      ];
      allOrders.forEach((o) => createdOrders.push(o.id));
      expect(allOrders).toHaveLength(1);
    });

    it('produit VIRTUEL : illimité, aucun stock à décrémenter', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const guide = await createProduct({
        valueBv: 250,
        type: ProductType.VIRTUAL,
      });
      const ecard = await genesisEcard(2500);

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: guide.id, quantity: 10 }],
          ecardCode: ecard.code,
        }),
      );

      expect(order.totalBv).toBe(2500);
      expect(order.shipmentStatus).toBeNull(); // rien à expédier
      expect(await stockOf(guide.id)).toBeNull(); // toujours illimité
    });
  });

  // ─────────────────────────── Expédition (admin) ───────────────────────────

  describe('Suivi d’expédition', () => {
    it('PREPARATION → SHIPPED → DELIVERED, et jamais en arrière', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 5 });
      const ecard = await genesisEcard(250);

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 1 }],
          ecardCode: ecard.code,
          shippingAddress: 'Tunis',
        }),
      );
      expect(order.shipmentStatus).toBe(ShipmentStatus.PREPARATION);

      const shipped = await orders.updateShipment(
        adminId,
        order.id,
        ShipmentStatus.SHIPPED,
      );
      expect(shipped.shipmentStatus).toBe(ShipmentStatus.SHIPPED);

      await expect(
        orders.updateShipment(adminId, order.id, ShipmentStatus.PREPARATION),
      ).rejects.toBeInstanceOf(InvalidShipmentTransitionError);

      const delivered = await orders.updateShipment(
        adminId,
        order.id,
        ShipmentStatus.DELIVERED,
      );
      expect(delivered.shipmentStatus).toBe(ShipmentStatus.DELIVERED);
    });

    it('commande 100 % virtuelle → aucun suivi d’expédition', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const guide = await createProduct({
        valueBv: 250,
        type: ProductType.VIRTUAL,
      });
      const ecard = await genesisEcard(250);

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: guide.id, quantity: 1 }],
          ecardCode: ecard.code,
        }),
      );

      await expect(
        orders.updateShipment(adminId, order.id, ShipmentStatus.SHIPPED),
      ).rejects.toBeInstanceOf(ShipmentNotApplicableError);
    });
  });
});
