import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MemberStatus } from '@prisma/client';

// ─────────────────────────── Catalogue ───────────────────────────

export class CategoryNotFoundError extends NotFoundException {
  constructor(id: number) {
    super(`Catégorie ${id} introuvable.`);
  }
}

export class CategoryNotEmptyError extends ConflictException {
  constructor(id: number, productCount: number) {
    super(
      `Catégorie ${id} non supprimable : ${productCount} produit(s) y sont rattachés.`,
    );
  }
}

export class ProductNotFoundError extends NotFoundException {
  constructor(id: number) {
    super(`Produit ${id} introuvable.`);
  }
}

/** Stock et type sont liés : PHYSIQUE en a un, VIRTUEL est illimité et n'en a pas (D-005). */
export class InvalidProductStockError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

// ─────────────────────────── Panier & checkout ───────────────────────────

export class EmptyCartError extends BadRequestException {
  constructor() {
    super('Panier vide.');
  }
}

/** Produit inexistant, désactivé, ou dont la valeur BV a changé pendant le checkout. */
export class ProductUnavailableError extends ConflictException {
  constructor(productId: number) {
    super(`Produit ${productId} indisponible : il a été retiré ou modifié.`);
  }
}

export class OutOfStockError extends ConflictException {
  constructor(productId: number, requested: number) {
    super(
      `Stock insuffisant pour le produit ${productId} (${requested} demandé(s)).`,
    );
  }
}

/**
 * Composition du pack (D-006) : la somme des BV du panier doit égaler EXACTEMENT le palier.
 * Ni plus (le surplus serait du BV offert), ni moins (le membre serait activé à rabais).
 */
export class CartTierMismatchError extends ConflictException {
  constructor(cartBv: number, tierBv: number, packName?: string) {
    super(
      `Le panier totalise ${cartBv} BV : le pack ${packName ?? ''} exige exactement ${tierBv} BV.`.replace(
        /\s+/g,
        ' ',
      ),
    );
  }
}

/** L'achat libre est réservé aux membres ACTIFS (spec §5.7). */
export class MemberNotActiveError extends ForbiddenException {
  constructor(memberId: number, status: MemberStatus) {
    super(
      `Membre ${memberId} : achat libre réservé aux membres ACTIFS (statut actuel : ${status}).`,
    );
  }
}

// ─────────────────────────── Commandes ───────────────────────────

export class OrderNotFoundError extends NotFoundException {
  constructor(id: number) {
    super(`Commande ${id} introuvable.`);
  }
}

/** Une commande 100 % virtuelle n'a pas d'expédition : rien à préparer, rien à livrer. */
export class ShipmentNotApplicableError extends ConflictException {
  constructor(orderId: number) {
    super(
      `Commande ${orderId} : aucun produit physique, le suivi d'expédition ne s'applique pas.`,
    );
  }
}

/** PREPARATION → SHIPPED → LIVRE, dans cet ordre : on ne « dé-livre » pas un colis. */
export class InvalidShipmentTransitionError extends ConflictException {
  constructor(from: string, to: string) {
    super(`Transition d'expédition invalide : ${from} → ${to}.`);
  }
}
