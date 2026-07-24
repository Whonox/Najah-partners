import type { components } from "./generated/schema"

/**
 * Les énumérations du domaine, **DÉRIVÉES** du schéma généré — jamais recopiées.
 *
 * `openapi-typescript` rend les enums Prisma en unions de chaînes INLINE dans chaque DTO
 * (`status: "REGISTERED" | "ACTIVE" | "INACTIVE"`) : il n'existe donc pas de type nommé à
 * importer. Retaper l'union dans un composant en ferait une copie manuelle, exactement ce
 * qu'interdit `admin/CLAUDE.md` — et le jour où le backend ajoute une valeur, le front
 * continuerait de compiler en l'ignorant.
 *
 * En pointant sur le champ du DTO, la source de vérité reste l'OpenAPI : ajouter un état
 * côté backend le propage ici à la régénération, et casse la compilation là où le nouvel
 * état n'est pas traité — ce qui est précisément le service qu'on attend du typage.
 */

type Schemas = components["schemas"]

/** INSCRIT → ACTIF ⇄ INACTIF (§5.9). INACTIF = gel de non-renouvellement (D-034). */
export type MemberStatus = Schemas["MemberListItemDto"]["status"]

/** Vérification d'identité (D-018) — informative, jamais bloquante. */
export type VerificationStatus =
  Schemas["MemberListItemDto"]["verificationStatus"]

/** Jambe occupée sous l'upline de placement. Nulle pour la racine de l'arbre. */
export type Leg = NonNullable<Schemas["MemberDetailDto"]["leg"]>

export type IdDocumentType = NonNullable<
  Schemas["MemberDetailDto"]["idDocumentType"]
>

/** ACTIVATION (panier au palier exact) ou FREE (achat libre, sans effet sur l'arbre). */
export type OrderContext = Schemas["OrderResponseDto"]["context"]

export type OrderStatus = Schemas["OrderResponseDto"]["status"]

/** PREPARATION → SHIPPED → DELIVERED. `null` = aucun produit PHYSIQUE dans la commande. */
export type ShipmentStatus = NonNullable<
  Schemas["OrderResponseDto"]["shipmentStatus"]
>

export type ProductType = Schemas["ProductResponseDto"]["type"]

export type LedgerMovementType = Schemas["LedgerEntryResponseDto"]["type"]

/**
 * Valeurs énumérées à parcourir (listes déroulantes de filtres, onglets). Elles doivent
 * bien, elles, être écrites : un type TypeScript n'existe pas à l'exécution, on ne peut pas
 * itérer dessus. L'annotation `satisfies readonly X[]` fait le lien — ajouter une valeur
 * côté backend sans l'ajouter ici ne casse rien, mais en RETIRER une, ou se tromper de
 * libellé, ne compile pas.
 */
export const MEMBER_STATUSES = [
  "REGISTERED",
  "ACTIVE",
  "INACTIVE",
] as const satisfies readonly MemberStatus[]

export const VERIFICATION_STATUSES = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
] as const satisfies readonly VerificationStatus[]

export const ORDER_CONTEXTS = [
  "ACTIVATION",
  "FREE",
] as const satisfies readonly OrderContext[]

export const SHIPMENT_STATUSES = [
  "PREPARATION",
  "SHIPPED",
  "DELIVERED",
] as const satisfies readonly ShipmentStatus[]

export const PRODUCT_TYPES = [
  "PHYSICAL",
  "VIRTUAL",
] as const satisfies readonly ProductType[]

/**
 * Le colis n'avance que dans un sens (jamais de « dé-livraison ») : cette table dit quelle
 * étape proposer, et rien de plus. Le backend refuse de toute façon toute transition qui
 * n'est pas dans SA table — le front ne fait ici qu'éviter d'afficher un bouton condamné.
 */
export const NEXT_SHIPMENT_STATUS: Record<ShipmentStatus, ShipmentStatus | null> =
  {
    PREPARATION: "SHIPPED",
    SHIPPED: "DELIVERED",
    DELIVERED: null,
  }
