import { ConfigService } from '@nestjs/config';
import {
  EcardStatus,
  Leg,
  LedgerMovementType,
  MemberStatus,
  OrderContext,
  OrderStatus,
  ProductType,
  ShipmentStatus,
} from '@prisma/client';
import { CommissionEventsService } from '../commissions/commission-events.service';
import { Money, money } from '../common/money';
import { LedgerService } from '../ledger/ledger.service';
import { EcardsTotalMismatchError } from '../ecards/ecards.errors';
import { EcardsService } from '../ecards/ecards.service';
import { ActivationService } from '../members/activation.service';
import { MemberCodeService } from '../members/member-code.service';
import {
  MembershipFeeService,
  REGISTRATION_FEE_SETTING,
} from '../members/membership-fee.service';
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
 *
 * Deux dimensions (D-028) :
 *   ACTIVATION → panier = palier en POINTS (D-006) ; e-card = PRIX DU PACK en DINARS (D-029) ;
 *   LIBRE      → e-card = somme des PRIX DT du panier.
 */

jest.setTimeout(60_000);

describe('Boutique & checkout — intégration (vrai Postgres)', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let members: MembersService;
  let activation: ActivationService;
  let ecards: EcardsService;
  let orders: OrdersService;
  let checkout: CheckoutService;
  let packId: number;
  let tierBv: number; // POINTS — palier
  let priceDt: Money; // DINARS — TARIF du pack (D-029)
  let feeDt: Money; // DINARS — frais d'inscription = acompte (D-036/D-037)
  let dueDt: Money; // DINARS — ce que l'activation encaisse (prix − acompte)
  let fees: MembershipFeeService;
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

  /** Les frais d'inscription se règlent par e-card (D-036) : sans elle, pas d'inscription. */
  async function register(uplineCode: string, leg: Leg) {
    seq += 1;
    const fee = await genesisEcard(feeDt);
    const member = await members.register({
      lastName: 'Test',
      firstName: `S${seq}`,
      email: `shop-${Date.now()}-${seq}@test.local`,
      password: 'MotDePasse123!',
      sponsorCode: uplineCode,
      uplineCode,
      leg,
      ecardCodes: [fee.code],
    });
    createdMembers.push(member.id);
    return member;
  }

  /** Membre ACTIF : inscrit, financé du MONTANT DÛ (prix − acompte, D-037), puis activé. */
  async function activeMember(uplineCode: string, leg: Leg) {
    const member = await register(uplineCode, leg);
    await fund(member.id, dueDt);
    await activation.activate({ memberId: member.id, packId });
    return member;
  }

  async function fund(memberId: number, amountDt: Money) {
    await ledger.recordMovement({
      memberId,
      type: LedgerMovementType.ADMIN_GENESIS,
      amountDt,
      reason: 'Test boutique',
    });
  }

  /** E-card de genèse : la valeur exacte (en DT), sans avoir à financer un créateur. */
  async function genesisEcard(valueDt: Money) {
    const ecard = await ecards.genesis({ adminId, valueDt });
    createdEcards.push(ecard.id);
    return ecard;
  }

  async function createProduct(input: {
    valueBv: number; // POINTS
    type?: ProductType;
    stock?: number | null;
    priceDt?: number; // DINARS
    shippingFeeDt?: number;
    promoPriceDt?: number;
  }) {
    seq += 1;
    const type = input.type ?? ProductType.PHYSICAL;
    const product = await prisma.product.create({
      data: {
        name: `Produit test ${seq}`,
        categoryId,
        priceDt: money(input.priceDt ?? 100),
        valueBv: input.valueBv,
        type,
        stock: type === ProductType.VIRTUAL ? null : (input.stock ?? 1000),
        shippingFeeDt: money(input.shippingFeeDt ?? 0),
        promoPriceDt:
          input.promoPriceDt === undefined ? null : money(input.promoPriceDt),
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
    prisma.ledgerEntry.findMany({ where: { memberId } });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const config = {
      get: jest.fn((key: string, def?: string) =>
        key === 'BCRYPT_ROUNDS' ? '4' : def,
      ),
    } as unknown as ConfigService;

    ledger = new LedgerService(prisma);
    const placement = new PlacementService(prisma);
    ecards = new EcardsService(prisma, ledger);
    fees = new MembershipFeeService(prisma);
    members = new MembersService(
      prisma,
      config,
      placement,
      new MemberCodeService(),
      fees,
      ecards,
    );
    activation = new ActivationService(
      prisma,
      placement,
      new CommissionEventsService(),
      new BalanceActivationPayment(ledger),
    );
    orders = new OrdersService(prisma);
    checkout = new CheckoutService(prisma, activation, ecards, orders);

    const pack = await prisma.pack.findFirstOrThrow({
      where: { name: 'Silver' },
    });
    packId = pack.id;
    tierBv = pack.tierBv; // 1000 points
    priceDt = pack.priceDt; // 2200 DT — le TARIF
    feeDt = await fees.read(REGISTRATION_FEE_SETTING); // 100 DT — l'acompte (D-036)
    dueDt = priceDt.minus(feeDt); // 2100 DT — ce que l'activation encaisse (D-037)

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

    // Ordre imposé par les FK : mouvements → e-cards → commandes → produits → paiements
    // d'adhésion → membres. Les e-cards passent AVANT les commandes depuis la Tranche 7.5 :
    // c'est `Ecard.orderId` (cumul, D-030) qui porte désormais le lien, en `Restrict`.
    if (memberIds.length > 0) {
      // Les activations écrivent des événements de commission (temps 1, D-035).
      await prisma.commissionEvent.deleteMany({
        where: {
          OR: [
            { memberId: { in: memberIds } },
            { sourceMemberId: { in: memberIds } },
          ],
        },
      });
      await prisma.ledgerEntry.deleteMany({
        where: { memberId: { in: memberIds } },
      });
    }
    if (ecardIds.length > 0) {
      await prisma.ledgerEntry.deleteMany({
        where: { ecardId: { in: ecardIds } },
      });
      await prisma.ecard.deleteMany({ where: { id: { in: ecardIds } } });
    }
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
      await prisma.membershipPayment.deleteMany({
        where: { memberId: { in: memberIds } },
      });
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

  describe('Activation (D-006, D-007, D-029)', () => {
    it('panier = palier EXACT (POINTS) → commande PAID payée au PRIX DU PACK, e-card USED, membre ACTIF, arbre crédité, stock décrémenté', async () => {
      const root = await createRoot();
      const member = await register(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10 }); // 4 × 250 = 1000 points
      const ecard = await genesisEcard(dueDt); // l'e-card vaut le prix du pack MOINS l'acompte

      const order = await track(
        checkout.activationCheckout({
          memberId: member.id,
          packId,
          items: [{ productId: oil.id, quantity: 4 }],
          ecardCodes: [ecard.code],
          shippingAddress: 'Tunis',
        }),
      );

      expect(order.context).toBe(OrderContext.ACTIVATION);
      expect(order.status).toBe(OrderStatus.PAID);
      // 2200 (prix du pack) − 100 (acompte d'inscription, D-037) = 2100 — et surtout pas
      // 4 × 100 DT, la somme des prix des produits du panier (D-029).
      expect(order.totalDt).toBe(dueDt.toFixed(3));
      expect(order.ecardIds).toEqual([ecard.id]);
      expect(order.totalPoints).toBe(tierBv); // le palier
      expect(order.shipmentStatus).toBe(ShipmentStatus.PREPARATION);
      expect(order.lines[0].unitValueBv).toBe(250); // snapshot figé (POINTS)

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.USED);

      const activated = await memberRow(member.id);
      expect(activated.status).toBe(MemberStatus.ACTIVE);
      expect(activated.activationTierBv).toBe(tierBv);
      // Seule l'activation injecte des POINTS dans l'arbre (D-005) : l'upline est crédité du palier.
      expect((await memberRow(root.id)).leftPoints).toBe(tierBv);
      // …et le membre lui-même n'est crédité d'AUCUN solde : l'e-card a payé, elle n'a pas rechargé.
      expect(activated.balanceDt.toString()).toBe('0');

      expect(await stockOf(oil.id)).toBe(6);
    });

    it('panier ≠ palier (POINTS) → REFUSÉ : e-card ACTIVE, membre INSCRIT, stock intact, aucune commande', async () => {
      const root = await createRoot();
      const member = await register(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10 });
      const ecard = await genesisEcard(dueDt);

      await expect(
        checkout.activationCheckout({
          memberId: member.id,
          packId,
          items: [{ productId: oil.id, quantity: 3 }], // 750 points ≠ 1000
          ecardCodes: [ecard.code],
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
      const ecard = await genesisEcard(dueDt);

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
          items: [{ productId: oil.id, quantity: 2 }], // 1000 points = palier
          ecardCodes: [ecard.code],
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

    it('e-card de valeur ≠ prix du pack → refusée (couverture exacte, D-007)', async () => {
      const root = await createRoot();
      const member = await register(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 1000, stock: 5 }); // panier conforme (1000 points)
      const ecard = await genesisEcard(dueDt.plus(500)); // trop-perçu sur le montant dû : refusé

      await expect(
        checkout.activationCheckout({
          memberId: member.id,
          packId,
          items: [{ productId: oil.id, quantity: 1 }],
          ecardCodes: [ecard.code],
        }),
      ).rejects.toBeInstanceOf(EcardsTotalMismatchError);

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
      expect((await memberRow(member.id)).status).toBe(MemberStatus.REGISTERED);
      expect(await stockOf(oil.id)).toBe(5);
    });
  });

  // ─────────────────────────── Checkout ACHAT LIBRE ───────────────────────────

  describe('Achat libre (D-005, D-025, D-028)', () => {
    it('e-card = somme EXACTE des PRIX → commande FREE, AUCUN point dans l’arbre, AUCUN mouvement de grand livre', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10, priceDt: 100 });
      const ecard = await genesisEcard(money(300)); // 3 × 100 DT

      const rootBefore = await memberRow(root.id);
      const ledgerBefore = await ledgerOf(buyer.id);
      const balanceBefore = (await memberRow(buyer.id)).balanceDt.toString();

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 3 }], // 300 DT, 750 points (qui ne vont nulle part)
          ecardCodes: [ecard.code],
        }),
      );

      expect(order.context).toBe(OrderContext.FREE);
      expect(order.totalDt).toBe('300.000');
      expect(order.totalPoints).toBe(750);
      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.USED);
      expect(await stockOf(oil.id)).toBe(7);

      // L'achat de produits n'alimente PAS l'arbre (D-005) : rien n'a bougé chez l'upline.
      const rootAfter = await memberRow(root.id);
      expect(rootAfter.leftPoints).toBe(rootBefore.leftPoints);
      expect(rootAfter.rightPoints).toBe(rootBefore.rightPoints);

      // L'e-card paie, elle ne recharge pas (D-025) : le grand livre du membre est INCHANGÉ.
      expect(await ledgerOf(buyer.id)).toHaveLength(ledgerBefore.length);
      expect((await memberRow(buyer.id)).balanceDt.toString()).toBe(
        balanceBefore,
      );
    });

    it('e-card ≠ somme du panier → refusée, stock intact', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10, priceDt: 100 });
      const ecard = await genesisEcard(money(500)); // le panier vaudra 300 DT

      await expect(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 3 }],
          ecardCodes: [ecard.code],
        }),
      ).rejects.toBeInstanceOf(EcardsTotalMismatchError);

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
      expect(await stockOf(oil.id)).toBe(10);
    });

    it('membre INSCRIT → achat libre refusé (réservé aux ACTIFS)', async () => {
      const root = await createRoot();
      const member = await register(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 10 });
      const ecard = await genesisEcard(money(100));

      await expect(
        checkout.freeCheckout({
          memberId: member.id,
          items: [{ productId: oil.id, quantity: 1 }],
          ecardCodes: [ecard.code],
        }),
      ).rejects.toBeInstanceOf(MemberNotActiveError);

      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.ACTIVE);
    });
  });

  // ─────────────────────────── Frais de livraison & promo ───────────────────────────

  describe('Ce qui n’entre jamais dans le montant DT dû (D-002)', () => {
    it('frais de livraison : affichés, jamais ajoutés au montant DT dû', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      // 40 DT de frais de livraison : ils ne doivent RIEN changer au montant dû.
      const oil = await createProduct({
        valueBv: 500,
        stock: 10,
        priceDt: 190,
        shippingFeeDt: 40,
      });
      const ecard = await genesisEcard(money(380)); // exactement 2 × 190 DT

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 2 }],
          ecardCodes: [ecard.code],
          shippingAddress: 'Sfax',
        }),
      );

      expect(order.totalDt).toBe('380.000'); // et non « 380 + 80 de livraison »
      expect((await ecardRow(ecard.id)).status).toBe(EcardStatus.USED);
    });

    it('promo : le prix effectif est le prix promo, la valeur BV ne bouge pas', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const oil = await createProduct({
        valueBv: 500,
        stock: 10,
        priceDt: 190,
        promoPriceDt: 169,
      });
      const ecard = await genesisEcard(money(169)); // le prix promo fait foi

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 1 }],
          ecardCodes: [ecard.code],
        }),
      );

      expect(order.totalDt).toBe('169.000');
      expect(order.lines[0].unitValueBv).toBe(500); // POINTS : inchangés
      expect(order.lines[0].unitPriceDt).toBe('169.000'); // DINARS : le prix promo, snapshoté
    });
  });

  // ─────────────────────────── Stock ───────────────────────────

  describe('Stock', () => {
    it('CONCURRENCE : deux commandes du DERNIER exemplaire → exactement une réussit', async () => {
      const root = await createRoot();
      const buyerA = await activeMember(root.memberCode, Leg.LEFT);
      const buyerB = await activeMember(root.memberCode, Leg.RIGHT);
      const rare = await createProduct({ valueBv: 250, stock: 1, priceDt: 100 });
      const ecardA = await genesisEcard(money(100));
      const ecardB = await genesisEcard(money(100));

      const results = await Promise.allSettled([
        checkout.freeCheckout({
          memberId: buyerA.id,
          items: [{ productId: rare.id, quantity: 1 }],
          ecardCodes: [ecardA.code],
        }),
        checkout.freeCheckout({
          memberId: buyerB.id,
          items: [{ productId: rare.id, quantity: 1 }],
          ecardCodes: [ecardB.code],
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
        priceDt: 100,
      });
      const ecard = await genesisEcard(money(1000)); // 10 × 100 DT

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: guide.id, quantity: 10 }],
          ecardCodes: [ecard.code],
        }),
      );

      expect(order.totalDt).toBe('1000.000');
      expect(order.totalPoints).toBe(2500);
      expect(order.shipmentStatus).toBeNull(); // rien à expédier
      expect(await stockOf(guide.id)).toBeNull(); // toujours illimité
    });
  });

  // ─────────────────────────── Expédition (admin) ───────────────────────────

  describe('Suivi d’expédition', () => {
    it('PREPARATION → SHIPPED → DELIVERED, et jamais en arrière', async () => {
      const root = await createRoot();
      const buyer = await activeMember(root.memberCode, Leg.LEFT);
      const oil = await createProduct({ valueBv: 250, stock: 5, priceDt: 100 });
      const ecard = await genesisEcard(money(100));

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: oil.id, quantity: 1 }],
          ecardCodes: [ecard.code],
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
        priceDt: 100,
      });
      const ecard = await genesisEcard(money(100));

      const order = await track(
        checkout.freeCheckout({
          memberId: buyer.id,
          items: [{ productId: guide.id, quantity: 1 }],
          ecardCodes: [ecard.code],
        }),
      );

      await expect(
        orders.updateShipment(adminId, order.id, ShipmentStatus.SHIPPED),
      ).rejects.toBeInstanceOf(ShipmentNotApplicableError);
    });
  });
});
