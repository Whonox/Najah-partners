import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CatalogService } from './catalog.service';
import {
  CategoryResponseDto,
  ProductResponseDto,
  toProductResponse,
} from './dto/catalog-response.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { ProductsQueryDto } from './dto/orders-query.dto';
import {
  CreateProductDto,
  ReorderProductImagesDto,
  UpdateProductDto,
} from './dto/product.dto';
import { MAX_PRODUCT_IMAGE_BYTES } from './product-image.service';
import { InvalidProductImageError } from './shop.errors';

/**
 * Catalogue — surface admin. RBAC aligné sur D-017b : le catalogue n'émet AUCUN BV (la
 * valeur BV d'un produit ne devient réelle qu'au checkout, par une e-card déjà payée), donc
 * l'écriture n'est pas réservée au SUPER_ADMIN — SUPER_ADMIN + MANAGER, comme l'ajustement.
 * Le SUPPORT lit, il ne modifie pas.
 *
 * Aucune suppression de produit : une commande passée le référence à vie. On le désactive.
 */
@ApiTags('shop-admin')
@RequireActor(ActorType.ADMIN)
@Controller('admin/shop')
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogService) {}

  // ── Catégories ──

  @Get('categories')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Lister les catégories.' })
  @ApiOkResponse({ type: CategoryResponseDto, isArray: true })
  listCategories() {
    return this.catalog.listCategories();
  }

  @Post('categories')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({ summary: 'Créer une catégorie.' })
  @ApiOkResponse({ type: CategoryResponseDto })
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.catalog.createCategory(admin.id, dto);
  }

  @Patch('categories/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({ summary: 'Modifier une catégorie.' })
  @ApiOkResponse({ type: CategoryResponseDto })
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.catalog.updateCategory(admin.id, id, dto);
  }

  @Delete('categories/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une catégorie VIDE (sinon refusée).' })
  @ApiNoContentResponse()
  deleteCategory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.catalog.deleteCategory(admin.id, id);
  }

  // ── Produits ──

  @Get('products')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({
    summary: 'Lister TOUS les produits (y compris inactifs et masqués).',
  })
  @ApiOkResponse({ type: ProductResponseDto, isArray: true })
  async listProducts(@Query() query: ProductsQueryDto) {
    const products = await this.catalog.listProductsAdmin(query.categoryId);
    return products.map(toProductResponse);
  }

  @Get('products/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Détail d’un produit (vue admin).' })
  @ApiOkResponse({ type: ProductResponseDto })
  async getProduct(@Param('id', ParseIntPipe) id: number) {
    return toProductResponse(await this.catalog.getProductAdmin(id));
  }

  @Post('products')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Créer un produit (valeur BV > 0 ; stock obligatoire si PHYSIQUE, interdit si VIRTUEL).',
  })
  @ApiOkResponse({ type: ProductResponseDto })
  async createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return toProductResponse(await this.catalog.createProduct(admin.id, dto));
  }

  @Patch('products/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Modifier un produit (désactiver = retirer de la vente ; les commandes passées gardent leur snapshot).',
  })
  @ApiOkResponse({ type: ProductResponseDto })
  async updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return toProductResponse(
      await this.catalog.updateProduct(admin.id, id, dto),
    );
  }

  // ── Images produit (D-054, D-059) ──
  //
  // SEUL écrivain de `Product.images`. Le champ était modifiable par `PATCH products/:id`
  // jusqu'en Tranche 9.5 : il acceptait n'importe quelle chaîne, donc n'importe quel chemin,
  // ce qui était sans conséquence tant qu'aucune route ne servait ces fichiers. Depuis qu'une
  // route les sert, la porte est fermée — ici, le nom du fichier est posé par le SERVEUR
  // après reconnaissance des OCTETS, jamais fourni par l'appelant.
  //
  // RBAC aligné sur le reste du catalogue (SUPER_ADMIN + MANAGER) : une photo n'émet aucune
  // commission et ne déplace aucun dinar — elle ne relève pas du régime des packs (D-043).

  @Post('products/:id/images')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description:
            'JPEG, PNG ou WebP, 5 Mo max. Pas de PDF : une photo finit dans un <img>.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Déposer une photo de produit (D-054) — ajoutée en fin de liste.',
    description:
      'Le format est reconnu par les OCTETS du fichier, jamais par le `Content-Type` annoncé. ' +
      'Le chemin stocké est RELATIF : y mettre une URL absolue demanderait une migration au ' +
      'premier changement de domaine ou de stockage (D-059).',
  })
  @ApiOkResponse({ type: ProductResponseDto })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(), // le fichier n'atteint le disque qu'une fois validé
      limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: 1 },
    }),
  )
  async addProductImage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: AuthenticatedActor,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    if (!image) throw new InvalidProductImageError('aucun fichier reçu.');
    return toProductResponse(
      await this.catalog.addProductImage(admin.id, id, image),
    );
  }

  @Delete('products/:id/images/:index')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary: 'Retirer une photo de produit.',
    description:
      'Le fichier n’est supprimé qu’APRÈS le commit : l’ordre inverse laisserait la fiche ' +
      'pointant vers une image détruite en cas d’échec.',
  })
  @ApiOkResponse({ type: ProductResponseDto })
  async removeProductImage(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return toProductResponse(
      await this.catalog.removeProductImage(admin.id, id, index),
    );
  }

  @Patch('products/:id/images/order')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Réordonner les photos — la première est celle que le portail met en avant.',
    description:
      'N’accepte qu’une PERMUTATION des chemins déjà en base : sans ce contrôle, cette route ' +
      'redeviendrait la porte par laquelle un chemin arbitraire s’écrit en base, puis se sert.',
  })
  @ApiOkResponse({ type: ProductResponseDto })
  async reorderProductImages(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReorderProductImagesDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return toProductResponse(
      await this.catalog.reorderProductImages(admin.id, id, dto.order),
    );
  }
}
