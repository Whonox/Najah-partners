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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType, AdminRole } from '@prisma/client';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RequireActor } from '../auth/decorators/actor-type.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CatalogService } from './catalog.service';
import {
  CategoryResponseDto,
  ProductResponseDto,
} from './dto/catalog-response.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { ProductsQueryDto } from './dto/orders-query.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

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
  listProducts(@Query() query: ProductsQueryDto) {
    return this.catalog.listProductsAdmin(query.categoryId);
  }

  @Get('products/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Détail d’un produit (vue admin).' })
  @ApiOkResponse({ type: ProductResponseDto })
  getProduct(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.getProductAdmin(id);
  }

  @Post('products')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Créer un produit (valeur BV > 0 ; stock obligatoire si PHYSIQUE, interdit si VIRTUEL).',
  })
  @ApiOkResponse({ type: ProductResponseDto })
  createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.catalog.createProduct(admin.id, dto);
  }

  @Patch('products/:id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.MANAGER)
  @ApiOperation({
    summary:
      'Modifier un produit (désactiver = retirer de la vente ; les commandes passées gardent leur snapshot).',
  })
  @ApiOkResponse({ type: ProductResponseDto })
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() admin: AuthenticatedActor,
  ) {
    return this.catalog.updateProduct(admin.id, id, dto);
  }
}
