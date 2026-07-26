import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Category } from '@prisma/client';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import {
  CategoryResponseDto,
  ProductResponseDto,
  toProductResponse,
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

  /**
   * Les produits passent tous par `toProductResponse` : les CHEMINS de stockage des photos
   * n'existent pas sur le fil, seul leur nombre en sort. Cette route est publique — y publier
   * l'arborescence du répertoire d'uploads n'aurait servi aucun client (les images se
   * demandent par position, ci-dessous) et aurait renseigné qui ne devait pas l'être.
   */
  @Get('products')
  @Public()
  @ApiOperation({
    summary:
      'Produits visibles et actifs, éventuellement filtrés par catégorie.',
  })
  @ApiOkResponse({ type: ProductResponseDto, isArray: true })
  async products(@Query() query: ProductsQueryDto) {
    const products = await this.catalog.listPublicProducts(query.categoryId);
    return products.map(toProductResponse);
  }

  @Get('products/:id')
  @Public()
  @ApiOperation({ summary: 'Détail d’un produit visible et actif.' })
  @ApiOkResponse({ type: ProductResponseDto })
  async product(@Param('id', ParseIntPipe) id: number) {
    return toProductResponse(await this.catalog.getPublicProduct(id));
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
   *
   * ═══ UNE POSITION N'EST PAS IMMUABLE — LE CACHE NE PEUT DONC PAS L'ÊTRE ═══
   * Cette route répondait `Cache-Control: immutable, max-age=1 an`, au motif que le nom du
   * fichier est un UUID posé au dépôt. Le raisonnement portait sur le FICHIER ; l'URL, elle,
   * désigne une POSITION. Depuis qu'on peut réordonner (D-062), la position 0 change de
   * contenu sans changer d'URL — et la promesse `immutable` devient un mensonge : le
   * navigateur garde l'ancienne vignette de couverture, pendant un an, sans jamais revérifier.
   * Défaut constaté au navigateur : le réordonnancement s'écrivait bien en base et l'écran
   * continuait d'afficher l'ordre précédent.
   *
   * On sert donc un **ETag** dérivé du chemin stocké — un UUID, donc unique par fichier — avec
   * une revalidation obligatoire. Le coût est une requête conditionnelle par vignette, à
   * laquelle on répond **sans toucher au disque** : la comparaison porte sur la ligne de base
   * qu'on lit de toute façon. On garde donc l'essentiel de ce que le cache long apportait, et
   * l'on cesse de mentir sur ce qui est immuable.
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
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const relativePath = await this.catalog.productImagePath(id, index);

    // L'ETag identifie le FICHIER qui occupe cette position aujourd'hui. Le chemin lui-même
    // ne sort jamais (D-062) : on n'en publie qu'une empreinte.
    const etag = `"${createHash('sha256').update(relativePath).digest('base64url').slice(0, 22)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      // 304 sans lecture disque : la position tient toujours le même fichier.
      res.status(304).end();
      return;
    }

    const file = await this.images.read(relativePath);
    if (!file) {
      // La ligne existe mais le fichier est absent ou illisible : 404, jamais 500 — la fiche
      // produit doit rester consultable sans sa photo.
      throw new NotFoundException('Image introuvable.');
    }

    res.setHeader('Content-Type', file.mime);
    res.send(file.buffer);
  }
}
