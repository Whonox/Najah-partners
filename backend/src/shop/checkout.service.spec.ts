import {
  MemberStatus,
  OrderContext,
  OrderStatus,
  Prisma,
  ProductType,
} from '@prisma/client';
import { money } from '../common/money';
import { EcardsService } from '../ecards/ecards.service';
import { ActivationService } from '../members/activation.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';
import { OrdersService } from './orders.service';
import {
  CartTierMismatchError,
  MemberNotActiveError,
  OutOfStockError,
  ProductUnavailableError,
} from './shop.errors';

/**
 * Checkout — tests unitaires (Prisma mocké, sans base). On y vérifie les RÈGLES, pas
 * l'atomicité : le rollback, la concurrence de stock et la propagation d'arbre exigent un
 * vrai Postgres et vivent dans `shop.int-spec.ts`.
 *
 * Les DEUX dimensions (D-028) : le panier compose le palier en POINTS, l'e-card paie en DINARS.
 *   ACTIVATION → dû = PRIX DU PACK (D-029), indépendant des prix des produits ;
 *   LIBRE      → dû = Σ des prix effectifs des produits.
 * L'achat libre ne touche jamais l'arbre.
 */

const SILVER = {
  id: 1,
  name: 'Silver',
  tierBv: 1000, // POINTS
  priceDt: money(2200), // DINARS — le prix payé (D-029)
  active: true,
};

/** Un physique en promo AVEC frais de livraison : les deux pièges de la spec, sur un produit. */
const OLIVE_OIL = {
  id: 10,
  name: 'Huile 1 L',
  type: ProductType.PHYSICAL,
  valueBv: 250, // POINTS
  priceDt: new Prisma.Decimal(45), // DINARS
  promoPriceDt: new Prisma.Decimal('39.900'), // le prix baisse…
  shippingFeeDt: new Prisma.Decimal(7), // …et la livraison se règle hors système
  stock: 100,
  active: true,
};

const GUIDE = {
  id: 20,
  name: 'Guide numérique',
  type: ProductType.VIRTUAL,
  valueBv: 500,
  priceDt: new Prisma.Decimal(40),
  promoPriceDt: null,
  shippingFeeDt: new Prisma.Decimal(0),
  stock: null,
  active: true,
};

type ProductRow = typeof OLIVE_OIL | typeof GUIDE;

interface Scenario {
  products?: ProductRow[];
  memberStatus?: MemberStatus;
  /** Palier (POINTS) renvoyé par le snapshot d'activation (peut différer du pack pré-lu). */
  snapshotTierBv?: number;
  /** Le décrément gardé ne rend aucune ligne (rupture ou produit modifié). */
  stockGuardFails?: boolean;
}

function makeService(scenario: Scenario = {}) {
  const products = scenario.products ?? [OLIVE_OIL, GUIDE];

  const productFindMany = jest.fn(async () => products);
  const productFindUnique = jest.fn(async (args: { where: { id: number } }) => {
    const p = products.find((x) => x.id === args.where.id);
    return p
      ? {
          active: p.active,
          valueBv: p.valueBv,
          stock: p.stock,
          priceDt: p.priceDt,
          promoPriceDt: p.promoPriceDt,
        }
      : null;
  });
  // Le checkout INSÈRE la commande, rattache les e-cards, puis RELIT (les cartes sont
  // brûlées avant que l'`Order` n'existe — ordre de verrouillage D-024). On rejoue les deux
  // temps : `create` mémorise les données, `findUniqueOrThrow` rend la commande complète.
  let lastOrder: Record<string, any> | null = null;
  const orderCreate = jest.fn(async (args: { data: Record<string, any> }) => {
    lastOrder = args.data;
    return { id: 99 };
  });
  const attachedEcardIds: number[] = [];
  const orderFindUniqueOrThrow = jest.fn(async () => ({
    id: 99,
    memberId: lastOrder!.memberId,
    // La relecture porte `ORDER_INCLUDE`, qui ramène le membre : la vue l'identifie par son
    // CODE (`NP…`), la seule clé qu'un administrateur lise.
    member: {
      id: lastOrder!.memberId,
      memberCode: 'NP000042',
      firstName: 'Test',
      lastName: 'Membre',
    },
    context: lastOrder!.context,
    status: lastOrder!.status,
    totalDt: lastOrder!.totalDt,
    totalPoints: lastOrder!.totalPoints,
    ecardCount: lastOrder!.ecardCount,
    shippingAddress: lastOrder!.shippingAddress,
    shipmentStatus: lastOrder!.shipmentStatus,
    createdAt: new Date(),
    paidAt: lastOrder!.paidAt,
    ecards: attachedEcardIds.map((id) => ({ id })),
    lines: (lastOrder!.lines.create as Array<Record<string, any>>).map((l) => ({
      ...l,
      product: { name: 'x' },
    })),
  }));
  const auditCreate = jest.fn(async () => ({}));

  // Le `$queryRaw` du checkout sert à deux choses : verrouiller/lire le statut du membre
  // (achat libre) et décrémenter le stock. On les distingue par le SQL lui-même.
  const queryRaw = jest.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('');
    if (sql.includes('FROM "Member"')) {
      return [{ status: scenario.memberStatus ?? MemberStatus.ACTIVE }];
    }
    return scenario.stockGuardFails ? [] : [{ id: 1 }];
  });

  const tx = {
    $executeRawUnsafe: jest.fn(async () => 0),
    $queryRaw: queryRaw,
    product: { findMany: productFindMany, findUnique: productFindUnique },
    order: { create: orderCreate, findUniqueOrThrow: orderFindUniqueOrThrow },
    auditLog: { create: auditCreate },
  };

  const transaction = jest.fn(async (cb: (t: unknown) => unknown) => cb(tx));
  const prisma = {
    $transaction: transaction,
    pack: { findUnique: jest.fn(async () => SILVER) },
    product: {
      findMany: jest.fn(async () =>
        products.map((p) => ({
          id: p.id,
          valueBv: p.valueBv,
          active: p.active,
        })),
      ),
    },
  } as unknown as PrismaService;

  const activateInTx = jest.fn(
    async (_tx: unknown, input: { packId: number }) => ({
      memberId: 1,
      memberCode: 'NP000001',
      packId: input.packId,
      snapshot: {
        packName: 'Silver',
        tierBv: scenario.snapshotTierBv ?? SILVER.tierBv,
        priceDt: '2200.000', // le TARIF
        registrationCreditDt: '100.000', // l'acompte d'inscription (D-037)
        amountDueDt: '2100.000', // ce que l'e-card doit couvrir
        directCommissionDt: '500.000',
        indirectCommissionDt: '250.000',
        weeklyCapDt: '10000.000',
      },
      baselineLeft: 0,
      baselineRight: 0,
      creditedAncestors: 3,
      commissionEvents: { direct: 1, balance: 0, startupBonus: 0, rewardPoint: 0 },
      payment: {
        method: 'ECARD' as const,
        ledgerEntryId: null,
        ecardIds: [42],
      },
    }),
  );
  const activation = { activateInTx } as unknown as ActivationService;

  const consumeManyInTx = jest.fn(async (..._args: unknown[]) => ({
    ecardIds: [42],
    totalDt: money(120),
  }));
  const attachToOrderInTx = jest.fn(
    async (_tx: unknown, ecardIds: number[]) => {
      attachedEcardIds.length = 0;
      attachedEcardIds.push(...ecardIds);
    },
  );
  const activationPayment = jest.fn((..._args: unknown[]) => ({
    settleInTx: jest.fn(),
  }));
  const ecards = {
    consumeManyInTx,
    attachToOrderInTx,
    activationPayment,
  } as unknown as EcardsService;

  const service = new CheckoutService(
    prisma,
    activation,
    ecards,
    new OrdersService(prisma),
  );

  return {
    service,
    transaction,
    activateInTx,
    activationPayment,
    consumeManyInTx,
    attachToOrderInTx,
    orderCreate,
    queryRaw,
    auditCreate,
  };
}

/** Le `dueDt` d'un appel à `consumeManyInTx`, en chaîne pour comparaison exacte. */
function dueOf(consumeManyInTx: jest.Mock, call = 0): string {
  const arg = consumeManyInTx.mock.calls[call][1] as { dueDt: Prisma.Decimal };
  return arg.dueDt.toString();
}

describe('CheckoutService — activation (D-006, D-007, D-029)', () => {
  it('panier ≠ palier (POINTS) → REFUSÉ avant toute transaction (aucune branche verrouillée)', async () => {
    const { service, transaction, activateInTx } = makeService();

    // 250 + 500 = 750 points ≠ 1000 (Silver).
    await expect(
      service.activationCheckout({
        memberId: 1,
        packId: 1,
        items: [
          { productId: 10, quantity: 1 },
          { productId: 20, quantity: 1 },
        ],
        ecardCodes: ['AAA-BBB-CCC-DDD'],
      }),
    ).rejects.toBeInstanceOf(CartTierMismatchError);

    expect(transaction).not.toHaveBeenCalled();
    expect(activateInTx).not.toHaveBeenCalled();
  });

  it('panier = palier → activation par E-CARD, commande PAID ; totalDt = PRIX − ACOMPTE, totalPoints = palier', async () => {
    const { service, activateInTx, activationPayment, orderCreate } =
      makeService();

    // 2 × 250 + 1 × 500 = 1000 points = palier Silver. Les prix des produits (2×39.9 + 40 =
    // 119.8 DT) n'ont AUCUNE incidence : l'activation paie le prix du pack (D-029), diminué
    // de l'acompte d'inscription (D-037).
    const order = await service.activationCheckout({
      memberId: 1,
      packId: 1,
      items: [
        { productId: 10, quantity: 2 },
        { productId: 20, quantity: 1 },
      ],
      ecardCodes: ['AAA-BBB-CCC-DDD'],
    });

    expect(activationPayment).toHaveBeenCalledWith(['AAA-BBB-CCC-DDD']);
    expect(activateInTx).toHaveBeenCalledTimes(1);
    expect(order.context).toBe(OrderContext.ACTIVATION);
    expect(order.status).toBe(OrderStatus.PAID);
    // 2200 (prix du pack) − 100 (acompte d'inscription, D-037) = 2100. Ni 119.8 (la somme
    // des prix du panier, D-029), ni 2200 (le tarif brut).
    expect(order.totalDt).toBe('2100.000');
    expect(order.totalPoints).toBe(1000); // le palier
    expect(order.ecardIds).toEqual([42]);
    expect(orderCreate.mock.calls[0][0].data.shipmentStatus).toBe(
      'PREPARATION',
    );
  });

  it('le palier qui FAIT FOI est celui du snapshot : pack modifié sous verrou → tout est annulé', async () => {
    // Le pré-contrôle voit 1000 (panier conforme), mais l'activation fige un palier de 2000 :
    // l'arbre a reçu 2000 — un panier à 1000 activerait à rabais.
    const { service } = makeService({ snapshotTierBv: 2000 });

    await expect(
      service.activationCheckout({
        memberId: 1,
        packId: 1,
        items: [{ productId: 10, quantity: 4 }], // 1000 points
        ecardCodes: ['AAA-BBB-CCC-DDD'],
      }),
    ).rejects.toBeInstanceOf(CartTierMismatchError);
  });
});

describe('CheckoutService — achat libre (D-005, D-025, D-028)', () => {
  it('e-card = somme EXACTE des PRIX → commande FREE, sans jamais toucher à l’arbre', async () => {
    const { service, activateInTx, consumeManyInTx, orderCreate } = makeService();

    const order = await service.freeCheckout({
      memberId: 1,
      items: [{ productId: 20, quantity: 3 }], // 3 × 40 DT = 120 DT (VIRTUEL), 3 × 500 = 1500 points
      ecardCodes: ['AAA-BBB-CCC-DDD'],
    });

    expect(dueOf(consumeManyInTx)).toBe('120'); // Σ des prix, en DINARS
    // Aucune activation, donc aucune propagation de points : l'achat libre est neutre (D-005).
    expect(activateInTx).not.toHaveBeenCalled();
    expect(order.context).toBe(OrderContext.FREE);
    expect(order.totalDt).toBe('120.000'); // payé en DT
    expect(order.totalPoints).toBe(1500); // points du panier (ne vont nulle part)
    // Commande 100 % virtuelle : rien à expédier.
    expect(orderCreate.mock.calls[0][0].data.shipmentStatus).toBeNull();
  });

  it('membre INSCRIT → achat libre refusé (réservé aux ACTIFS)', async () => {
    const { service, consumeManyInTx } = makeService({
      memberStatus: MemberStatus.REGISTERED,
    });

    await expect(
      service.freeCheckout({
        memberId: 1,
        items: [{ productId: 20, quantity: 1 }],
        ecardCodes: ['AAA-BBB-CCC-DDD'],
      }),
    ).rejects.toBeInstanceOf(MemberNotActiveError);
    expect(consumeManyInTx).not.toHaveBeenCalled();
  });

  it('le membre est verrouillé AVANT l’e-card, elle-même avant le produit (ordre D-024)', async () => {
    const { service, consumeManyInTx, queryRaw, orderCreate } = makeService();

    await service.freeCheckout({
      memberId: 1,
      items: [{ productId: 10, quantity: 4 }],
      ecardCodes: ['AAA-BBB-CCC-DDD'],
    });

    const memberLock = queryRaw.mock.invocationCallOrder[0];
    const ecardBurn = consumeManyInTx.mock.invocationCallOrder[0];
    const stockGuard = queryRaw.mock.invocationCallOrder[1];
    const orderInsert = orderCreate.mock.invocationCallOrder[0];
    expect(memberLock).toBeLessThan(ecardBurn);
    expect(ecardBurn).toBeLessThan(stockGuard);
    expect(stockGuard).toBeLessThan(orderInsert);
  });
});

describe('CheckoutService — le montant dû (achat libre) est la somme des PRIX, et rien d’autre', () => {
  it('les frais de livraison n’entrent JAMAIS dans le montant DT dû', async () => {
    const { service, consumeManyInTx } = makeService();

    // 4 × 39.9 DT = 159.6 DT. Le produit porte 7 DT de frais de livraison, l'e-card doit valoir
    // 159.6 — pas un millime de plus : les frais se règlent hors système.
    await service.freeCheckout({
      memberId: 1,
      items: [{ productId: 10, quantity: 4 }],
      ecardCodes: ['AAA-BBB-CCC-DDD'],
    });

    expect(dueOf(consumeManyInTx)).toBe('159.6');
  });

  it('promo : le prix effectif est le prix promo, la valeur BV ne bouge pas (D-002)', async () => {
    const { service, consumeManyInTx, orderCreate } = makeService();

    await service.freeCheckout({
      memberId: 1,
      items: [{ productId: 10, quantity: 2 }],
      ecardCodes: ['AAA-BBB-CCC-DDD'],
    });

    const line = orderCreate.mock.calls[0][0].data.lines.create[0];
    expect(line.unitValueBv).toBe(250); // POINTS : inchangés par la promo
    expect(line.unitPriceDt.toString()).toBe('39.9'); // DINARS : le prix promo
    expect(dueOf(consumeManyInTx)).toBe('79.8'); // 2 × 39.9, en dinars
  });

  it('quantités d’un même produit fusionnées en une seule ligne', async () => {
    const { service, orderCreate } = makeService();

    await service.freeCheckout({
      memberId: 1,
      items: [
        { productId: 10, quantity: 1 },
        { productId: 10, quantity: 3 },
      ],
      ecardCodes: ['AAA-BBB-CCC-DDD'],
    });

    const lines = orderCreate.mock.calls[0][0].data.lines.create;
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(4);
  });
});

describe('CheckoutService — stock', () => {
  it('décrément gardé sans effet → rupture (la commande entière échoue)', async () => {
    const { service, orderCreate } = makeService({ stockGuardFails: true });

    await expect(
      service.freeCheckout({
        memberId: 1,
        items: [{ productId: 10, quantity: 200 }], // stock 100
        ecardCodes: ['AAA-BBB-CCC-DDD'],
      }),
    ).rejects.toBeInstanceOf(OutOfStockError);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('produit désactivé pendant le checkout → commande refusée', async () => {
    const { service } = makeService({
      stockGuardFails: true,
      products: [{ ...OLIVE_OIL, active: false }, GUIDE],
    });

    await expect(
      service.freeCheckout({
        memberId: 1,
        items: [
          { productId: 20, quantity: 1 },
          { productId: 10, quantity: 1 },
        ],
        ecardCodes: ['AAA-BBB-CCC-DDD'],
      }),
    ).rejects.toBeInstanceOf(ProductUnavailableError);
  });

  it('produit VIRTUEL : illimité, son stock (null) n’est jamais décrémenté', async () => {
    const { service, queryRaw } = makeService();

    await service.freeCheckout({
      memberId: 1,
      items: [{ productId: 20, quantity: 999 }], // VIRTUEL, stock null
      ecardCodes: ['AAA-BBB-CCC-DDD'],
    });

    // Le SQL garde le stock intact pour un VIRTUEL (CASE … ELSE "stock") et n'exige aucune
    // disponibilité : la commande passe quelle que soit la quantité.
    const stockSql = queryRaw.mock.calls[1][0].join('');
    expect(stockSql).toContain('VIRTUAL');
    expect(stockSql).toContain('"stock" >=');
  });
});
