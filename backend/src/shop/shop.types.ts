import {
  OrderContext,
  OrderStatus,
  ProductType,
  ShipmentStatus,
} from '@prisma/client';
import { Money } from '../common/money';

/** Une ligne de panier telle que soumise (le DTO a déjà validé les bornes). */
export interface CartItemInput {
  productId: number;
  quantity: number;
}

/**
 * Ligne de panier CHIFFRÉE dans la transaction du checkout : `unitValueBv` (POINTS) et
 * `unitPriceDt` (DINARS) sont les valeurs figées (snapshot) écrites dans `OrderLine`.
 *
 * `unitPriceDt` est le prix EFFECTIF (promo appliquée). Les frais de livraison n'apparaissent
 * pas ici : ils se règlent hors système et n'entrent dans aucun total.
 */
export interface PricedLine {
  productId: number;
  name: string;
  type: ProductType;
  quantity: number;
  unitValueBv: number;
  unitPriceDt: Money;
}

/**
 * Panier chiffré — DEUX totaux, dans deux unités, qui ne se déduisent pas l'un de l'autre (D-028) :
 *   `totalPoints` → contrôle du palier à l'ACTIVATION (D-006) ;
 *   `totalDt`     → montant dû en achat LIBRE. (En ACTIVATION, le montant dû est le prix du
 *                   PACK — D-029 — et ce total n'est plus qu'une information.)
 */
export interface PricedCart {
  lines: PricedLine[];
  /** POINTS : Σ (valeur BV × quantité). */
  totalPoints: number;
  /** DINARS : Σ (prix effectif × quantité). Aucun frais de livraison, jamais. */
  totalDt: Money;
  hasPhysical: boolean;
}

/** Les montants sortent en CHAÎNE à 3 décimales : JSON n'a que des flottants (cf. money.ts). */
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
  /** DINARS payés : prix du pack (ACTIVATION) ou Σ des prix effectifs (LIBRE). */
  totalDt: string;
  /** POINTS du panier : le palier, en ACTIVATION. */
  totalPoints: number;
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
