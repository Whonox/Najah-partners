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

/**
 * Produit inexistant, désactivé, ou dont la valeur BV (points) ou le prix effectif (dinars) a
 * changé pendant le checkout — les deux dimensions sont épinglées au chiffrage.
 */
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
 * Composition du pack (D-006) : la somme des POINTS du panier doit égaler EXACTEMENT le palier.
 * Ni plus (le surplus serait des points offerts à l'arbre), ni moins (le membre entrerait dans
 * l'arbre à rabais). Le PRIX, lui, ne dépend pas du panier : c'est celui du pack (D-029).
 */
export class CartTierMismatchError extends ConflictException {
  constructor(cartPoints: number, tierBv: number, packName?: string) {
    super(
      `Le panier totalise ${cartPoints} points : le pack ${packName ?? ''} exige exactement ${tierBv} points.`.replace(
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

// ─────────────────────────── Images produit (D-054, D-059) ───────────────────────────

/** Fichier refusé au dépôt : trop lourd, vide, ou d'un format qui n'est pas une image. */
export class InvalidProductImageError extends BadRequestException {
  constructor(reason: string) {
    super(`Image produit refusée : ${reason}`);
  }
}

/**
 * Une fiche ne porte qu'un nombre borné de photos. Au-delà, elle devient illisible côté
 * portail — et le stockage grossit sans que personne ne le décide.
 */
export class TooManyProductImagesError extends ConflictException {
  constructor(max: number) {
    super(
      `Ce produit porte déjà le maximum de ${max} images. Supprimez-en une avant d'en ajouter.`,
    );
  }
}

/** L'index visé ne désigne aucune image de ce produit. */
export class ProductImageNotFoundError extends NotFoundException {
  constructor(productId: number, index: number) {
    super(`Le produit ${productId} n'a pas d'image à la position ${index}.`);
  }
}
