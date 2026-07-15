import { Injectable } from '@nestjs/common';
import { Category, Prisma, Product, ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import {
  CategoryNotEmptyError,
  CategoryNotFoundError,
  InvalidProductStockError,
  ProductNotFoundError,
} from './shop.errors';

/**
 * Catalogue (spec §5.7) : CRUD admin + lecture publique.
 *
 * Un produit n'est JAMAIS supprimé : une `OrderLine` le référence à vie (le snapshot de la
 * ligne fige BV et prix, mais la commande doit rester lisible). On le désactive (`active`),
 * ce qui le retire de la vente sans réécrire l'histoire.
 *
 * `active` (achetable) et `visibleOnSite` (vitrine publique) sont deux choses distinctes :
 * un produit peut être retiré de la vitrine sans cesser d'être vendable au checkout.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────── Catégories ───────────────────────────

  async listCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async createCategory(
    adminId: number,
    dto: CreateCategoryDto,
  ): Promise<Category> {
    const category = await this.prisma.category.create({ data: { ...dto } });
    await this.audit(adminId, 'CATEGORY_CREATED', category.id, null, category);
    return category;
  }

  async updateCategory(
    adminId: number,
    id: number,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) {
      throw new CategoryNotFoundError(id);
    }
    const category = await this.prisma.category.update({
      where: { id },
      data: { ...dto },
    });
    await this.audit(adminId, 'CATEGORY_UPDATED', id, before, category);
    return category;
  }

  /** Supprimable seulement si vide : sinon on orphelinerait des produits (FK Restrict). */
  async deleteCategory(adminId: number, id: number): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!category) {
      throw new CategoryNotFoundError(id);
    }
    if (category._count.products > 0) {
      throw new CategoryNotEmptyError(id, category._count.products);
    }
    await this.prisma.category.delete({ where: { id } });
    await this.audit(adminId, 'CATEGORY_DELETED', id, category, null);
  }

  // ─────────────────────────── Produits (admin) ───────────────────────────

  /** Vue admin : TOUT le catalogue, y compris les produits inactifs ou masqués. */
  async listProductsAdmin(categoryId?: number): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: categoryId ? { categoryId } : {},
      orderBy: { id: 'asc' },
    });
  }

  async getProductAdmin(id: number): Promise<Product> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new ProductNotFoundError(id);
    }
    return product;
  }

  async createProduct(
    adminId: number,
    dto: CreateProductDto,
  ): Promise<Product> {
    this.assertStockMatchesType(dto.type, dto.stock);
    await this.assertCategoryExists(dto.categoryId);

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        categoryId: dto.categoryId,
        priceDt: new Prisma.Decimal(dto.priceDt),
        valueBv: dto.valueBv,
        type: dto.type,
        stock: dto.type === ProductType.PHYSICAL ? dto.stock! : null,
        shippingFeeDt: new Prisma.Decimal(dto.shippingFeeDt ?? 0),
        promoPriceDt:
          dto.promoPriceDt === undefined
            ? null
            : new Prisma.Decimal(dto.promoPriceDt),
        images: dto.images ?? [],
        active: dto.active ?? true,
        visibleOnSite: dto.visibleOnSite ?? true,
      },
    });
    await this.audit(adminId, 'PRODUCT_CREATED', product.id, null, product);
    return product;
  }

  /**
   * Mise à jour partielle. Changer `valueBv` (points) ou `priceDt` (dinars) n'affecte AUCUNE
   * commande passée : chaque `OrderLine` porte son propre snapshot des deux (spec §5.8, D-028).
   */
  async updateProduct(
    adminId: number,
    id: number,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const before = await this.getProductAdmin(id);

    // Le stock est validé contre le type RÉSULTANT, pas l'ancien. Trois cas :
    //  - stock fourni       → le couple (type résultant, stock) doit être cohérent ;
    //  - type inchangé      → le stock existant l'est déjà ;
    //  - PHYSICAL → VIRTUAL → le stock est effacé (illimité) ; VIRTUAL → PHYSICAL exige un stock.
    const type = dto.type ?? before.type;
    let stock: number | null;
    if (dto.stock !== undefined) {
      this.assertStockMatchesType(type, dto.stock);
      stock = dto.stock;
    } else if (type === before.type) {
      stock = before.stock;
    } else if (type === ProductType.VIRTUAL) {
      stock = null;
    } else {
      throw new InvalidProductStockError(
        'Passage en PHYSIQUE : un stock est requis (0 = rupture).',
      );
    }
    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(dto.categoryId);
    }

    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.categoryId !== undefined)
      data.category = { connect: { id: dto.categoryId } };
    if (dto.priceDt !== undefined)
      data.priceDt = new Prisma.Decimal(dto.priceDt);
    if (dto.valueBv !== undefined) data.valueBv = dto.valueBv;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.shippingFeeDt !== undefined)
      data.shippingFeeDt = new Prisma.Decimal(dto.shippingFeeDt);
    if (dto.promoPriceDt !== undefined)
      data.promoPriceDt = new Prisma.Decimal(dto.promoPriceDt);
    if (dto.images !== undefined) data.images = dto.images;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.visibleOnSite !== undefined) data.visibleOnSite = dto.visibleOnSite;
    data.stock = stock;

    const product = await this.prisma.product.update({ where: { id }, data });
    await this.audit(adminId, 'PRODUCT_UPDATED', id, before, product);
    return product;
  }

  // ─────────────────────────── Catalogue public (lecture) ───────────────────────────

  /** Vitrine : uniquement ce qui est achetable ET publié. */
  async listPublicProducts(categoryId?: number): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: {
        active: true,
        visibleOnSite: true,
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ categoryId: 'asc' }, { id: 'asc' }],
    });
  }

  async getPublicProduct(id: number): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, active: true, visibleOnSite: true },
    });
    if (!product) {
      // Un produit masqué est indiscernable d'un produit inexistant : la vitrine ne
      // renseigne pas sur ce que l'admin a retiré.
      throw new ProductNotFoundError(id);
    }
    return product;
  }

  // ─────────────────────────── Interne ───────────────────────────

  /**
   * Stock et type sont indissociables : PHYSICAL en a un (0 = rupture), VIRTUAL n'en a
   * aucun (illimité — `null` ne veut pas dire « inconnu » mais « sans objet »). La base
   * tient le même invariant (`Product_type_stock_ck`) ; ici, on rend l'erreur parlante.
   */
  private assertStockMatchesType(
    type: ProductType,
    stock: number | null | undefined,
  ): void {
    if (type === ProductType.VIRTUAL) {
      if (stock !== undefined && stock !== null) {
        throw new InvalidProductStockError(
          'Un produit VIRTUEL est illimité : il ne prend pas de stock.',
        );
      }
      return;
    }
    if (stock === undefined || stock === null) {
      throw new InvalidProductStockError(
        'Un produit PHYSIQUE exige un stock (0 = rupture).',
      );
    }
    if (stock < 0) {
      throw new InvalidProductStockError('Le stock ne peut pas être négatif.');
    }
  }

  private async assertCategoryExists(categoryId: number): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new CategoryNotFoundError(categoryId);
    }
  }

  private async audit(
    adminId: number,
    action: string,
    id: number,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    const target = action.startsWith('CATEGORY')
      ? `Category:${id}`
      : `Product:${id}`;
    await this.prisma.auditLog.create({
      data: {
        actor: String(adminId),
        action,
        target,
        before: before
          ? (JSON.parse(JSON.stringify(before)) as Prisma.JsonObject)
          : undefined,
        after: after
          ? (JSON.parse(JSON.stringify(after)) as Prisma.JsonObject)
          : undefined,
      },
    });
  }
}
