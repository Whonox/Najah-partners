import { Module } from '@nestjs/common';
import { EcardsModule } from '../ecards/ecards.module';
import { MembersModule } from '../members/members.module';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrdersAdminController } from './orders-admin.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Boutique & checkout (Tranche 6). C'est ici — et nulle part ailleurs — que l'arbre
 * (`MembersModule`) et l'argent (`EcardsModule`) se rencontrent : le checkout est le seul
 * chemin qui mène un membre INSCRIT à ACTIF (D-023 : l'activation reste un service interne,
 * aucune route ne l'expose directement).
 *
 * Aucune écriture de solde ici : le grand livre n'est même pas importé. L'activation débite
 * (ou plutôt : brûle une e-card, D-025) via sa stratégie de paiement, et l'achat libre ne
 * touche à aucun solde.
 */
@Module({
  imports: [MembersModule, EcardsModule],
  controllers: [
    CatalogController,
    CatalogAdminController,
    CheckoutController,
    OrdersController,
    OrdersAdminController,
  ],
  providers: [CatalogService, CheckoutService, OrdersService],
  exports: [CatalogService, OrdersService],
})
export class ShopModule {}
