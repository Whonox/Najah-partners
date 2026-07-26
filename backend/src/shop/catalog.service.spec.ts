import { Prisma, ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { ProductImageService } from './product-image.service';
import { CategoryNotEmptyError, InvalidProductStockError } from './shop.errors';

/**
 * Catalogue — tests unitaires. Une seule règle structurante : **le stock n'existe que pour
 * le PHYSIQUE** (un VIRTUEL est illimité — `null` ne veut pas dire « inconnu », mais « sans
 * objet »). La base tient le même invariant (`Product_type_stock_ck`) ; ici on vérifie que
 * le service refuse AVANT d'y arriver, avec une erreur parlante.
 */

const PHYSICAL_PRODUCT = {
  id: 10,
  name: 'Huile 1 L',
  type: ProductType.PHYSICAL,
  stock: 100,
  valueBv: 250,
  categoryId: 1,
  priceDt: new Prisma.Decimal(45),
  promoPriceDt: null,
  shippingFeeDt: new Prisma.Decimal(7),
  active: true,
  visibleOnSite: true,
  description: null,
  images: [],
};

function makeService(product = PHYSICAL_PRODUCT) {
  const productCreate = jest.fn(
    async (args: { data: Record<string, any> }) => ({
      ...product,
      ...args.data,
      id: 11,
    }),
  );
  const productUpdate = jest.fn(
    async (args: { data: Record<string, any> }) => ({
      ...product,
      ...args.data,
    }),
  );

  const prisma = {
    category: {
      findUnique: jest.fn(async () => ({ id: 1, _count: { products: 2 } })),
      delete: jest.fn(async () => ({})),
    },
    product: {
      findUnique: jest.fn(async () => product),
      create: productCreate,
      update: productUpdate,
    },
    auditLog: { create: jest.fn(async () => ({})) },
  } as unknown as PrismaService;

  // Le dépôt de fichiers (T9.5, D-059) n'intervient dans aucun de ces scénarios — ils ne
  // portent que sur le couple type/stock. Un double vide suffit et garde ces tests hors du
  // système de fichiers.
  const images = {
    store: jest.fn(),
    read: jest.fn(),
    discard: jest.fn(),
  } as unknown as ProductImageService;

  return {
    service: new CatalogService(prisma, images),
    productCreate,
    productUpdate,
  };
}

describe('CatalogService — stock et type sont indissociables', () => {
  it('création d’un VIRTUEL avec stock → refusée', async () => {
    const { service } = makeService();

    await expect(
      service.createProduct(1, {
        name: 'Guide',
        categoryId: 1,
        priceDt: 40,
        valueBv: 250,
        type: ProductType.VIRTUAL,
        stock: 10,
      }),
    ).rejects.toBeInstanceOf(InvalidProductStockError);
  });

  it('création d’un PHYSIQUE sans stock → refusée (0 = rupture, mais il faut le dire)', async () => {
    const { service } = makeService();

    await expect(
      service.createProduct(1, {
        name: 'Huile',
        categoryId: 1,
        priceDt: 45,
        valueBv: 250,
        type: ProductType.PHYSICAL,
      }),
    ).rejects.toBeInstanceOf(InvalidProductStockError);
  });

  it('création d’un VIRTUEL sans stock → stock null (illimité)', async () => {
    const { service, productCreate } = makeService();

    await service.createProduct(1, {
      name: 'Guide',
      categoryId: 1,
      priceDt: 40,
      valueBv: 250,
      type: ProductType.VIRTUAL,
    });

    expect(productCreate.mock.calls[0][0].data.stock).toBeNull();
  });

  it('passage PHYSIQUE → VIRTUEL : le stock est effacé, pas conservé', async () => {
    const { service, productUpdate } = makeService();

    await service.updateProduct(1, 10, { type: ProductType.VIRTUAL });

    expect(productUpdate.mock.calls[0][0].data.stock).toBeNull();
  });
});

describe('CatalogService — promotion', () => {
  it('une promo baisse le prix DT et laisse la valeur BV intacte (D-002)', async () => {
    const { service, productUpdate } = makeService();

    await service.updateProduct(1, 10, { promoPriceDt: 39.9 });

    const data = productUpdate.mock.calls[0][0].data;
    expect(data.promoPriceDt.toString()).toBe('39.9');
    expect(data.valueBv).toBeUndefined(); // le BV n'est pas touché par une promo
  });
});

describe('CatalogService — catégories', () => {
  it('catégorie non vide → suppression refusée (aucun produit orphelin)', async () => {
    const { service } = makeService();

    await expect(service.deleteCategory(1, 1)).rejects.toBeInstanceOf(
      CategoryNotEmptyError,
    );
  });
});
