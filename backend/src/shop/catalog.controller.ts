import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Category, Product } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import {
  CategoryResponseDto,
  ProductResponseDto,
} from './dto/catalog-response.dto';
import { ProductsQueryDto } from './dto/orders-query.dto';

/**
 * Catalogue public (vitrine et boutique du portail). Lecture seule, sans authentification :
 * seuls les produits ACTIFS et VISIBLES sortent d'ici. Les prix en DT affichés ne sont
 * qu'indicatifs (D-002) — la valeur BV est la seule qui engage une transaction.
 */
@ApiTags('shop')
@Controller('shop')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @Public()
  @ApiOperation({ summary: 'Catégories de la boutique.' })
  @ApiOkResponse({ type: CategoryResponseDto, isArray: true })
  categories(): Promise<Category[]> {
    return this.catalog.listCategories();
  }

  @Get('products')
  @Public()
  @ApiOperation({
    summary:
      'Produits visibles et actifs, éventuellement filtrés par catégorie.',
  })
  @ApiOkResponse({ type: ProductResponseDto, isArray: true })
  products(@Query() query: ProductsQueryDto): Promise<Product[]> {
    return this.catalog.listPublicProducts(query.categoryId);
  }

  @Get('products/:id')
  @Public()
  @ApiOperation({ summary: 'Détail d’un produit visible et actif.' })
  @ApiOkResponse({ type: ProductResponseDto })
  product(@Param('id', ParseIntPipe) id: number): Promise<Product> {
    return this.catalog.getPublicProduct(id);
  }
}
