import {
  OrderContext,
  OrderStatus,
  ProductType,
  ShipmentStatus,
} from '@prisma/client';

/** Une ligne de panier telle que soumise (le DTO a déjà validé les bornes). */
export interface CartItemInput {
  productId: number;
  quantity: number;
}

/**
 * Ligne de panier CHIFFRÉE dans la transaction du checkout : `unitValueBv` et `unitPriceDt`
 * sont les valeurs figées (snapshot) écrites dans `OrderLine`.
 *
 * `unitPriceDt` est le prix EFFECTIF affiché (promo appliquée) — de l'affichage, jamais du
 * transactionnel (D-002). Les frais de livraison n'apparaissent pas ici : ils se règlent hors
 * système et n'entrent dans aucun total.
 */
export interface PricedLine {
  productId: number;
  name: string;
  type: ProductType;
  quantity: number;
  unitValueBv: number;
  unitPriceDt: string;
}

/** Panier chiffré : le montant BV dû, et rien d'autre, sert au règlement par e-card. */
export interface PricedCart {
  lines: PricedLine[];
  /** Σ (valeur BV × quantité). Aucun frais, aucune remise : le BV est l'unité unique. */
  totalBv: number;
  hasPhysical: boolean;
}

export interface OrderLineView {
  productId: number;
  productName: string;
  quantity: number;
  unitValueBv: number;
  unitPriceDt: string;
}

export interface OrderView {
  id: number;
  memberId: number;
  context: OrderContext;
  status: OrderStatus;
  totalBv: number;
  ecardId: number | null;
  shippingAddress: string | null;
  shipmentStatus: ShipmentStatus | null;
  createdAt: Date;
  paidAt: Date | null;
  lines: OrderLineView[];
}

export interface OrderPage {
  items: OrderView[];
  total: number;
  page: number;
  pageSize: number;
}
