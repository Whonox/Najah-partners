import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Category, Product } from '@prisma/client';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import {
  CategoryResponseDto,
  ProductResponseDto,
} from './dto/catalog-response.dto';
import { ProductsQueryDto } from './dto/orders-query.dto';
import { ProductImageService } from './product-image.service';

/**
 * Catalogue public (vitrine et boutique du portail). Lecture seule, sans authentification :
 * seuls les produits ACTIFS et VISIBLES sortent d'ici. Les prix en DT affichés ne sont
 * qu'indicatifs (D-002) — la valeur BV est la seule qui engage une transaction.
 */
@ApiTags('shop')
@Controller('shop')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly images: ProductImageService,
  ) {}

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

  /**
   * Sert la photo d'un produit (D-054, D-059).
   *
   * ═══ LECTURE OUVERTE, ET C'EST VOULU ═══
   * Une photo de produit est faite pour être vue — par l'affilié, et un jour par la vitrine
   * publique, qui n'a pas de session. Le contrôle d'accès porte sur l'ÉCRITURE seule. C'est
   * l'exact inverse des pièces d'identité (D-018), servies uniquement à l'administration :
   * même mécanique de stockage, régime d'accès opposé, parce que la donnée n'a pas la même
   * nature.
   *
   * ═══ L'INDEX N'EST PAS UN CHEMIN ═══
   * L'appelant désigne une POSITION dans la liste du produit ; le chemin est lu en base. Il
   * n'existe donc aucun paramètre par lequel demander un fichier arbitraire — la garantie est
   * structurelle, pas déclarative. Le service revérifie tout de même que le chemin lu reste
   * sous la racine de stockage : une donnée corrompue ne doit pas produire une lecture de
   * fichier hors du répertoire d'uploads.
   */
  @Get('products/:id/images/:index')
  @Public()
  @ApiOperation({
    summary: 'Photo d’un produit, par sa position dans la liste.',
  })
  @ApiOkResponse({
    description: 'Le fichier image (JPEG, PNG ou WebP).',
    content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
  })
  async productImage(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
    @Res() res: Response,
  ): Promise<void> {
    const relativePath = await this.catalog.productImagePath(id, index);
    const file = await this.images.read(relativePath);
    if (!file) {
      // La ligne existe mais le fichier est absent ou illisible : 404, jamais 500 — la fiche
      // produit doit rester consultable sans sa photo.
      throw new NotFoundException('Image introuvable.');
    }

    // Immuable : le nom du fichier est un UUID posé au dépôt, remplacer une photo crée un
    // nouveau chemin. Le cache long est donc sans risque et évite de relire le disque à
    // chaque vignette de la boutique.
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(file.buffer);
  }
}
