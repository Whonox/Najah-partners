import type { components } from "./generated/schema"

/**
 * Les énumérations du domaine, **DÉRIVÉES** du schéma généré — jamais recopiées.
 *
 * `openapi-typescript` rend les enums Prisma en unions de chaînes INLINE dans chaque DTO
 * (`status: "REGISTERED" | "ACTIVE" | "INACTIVE"`) : il n'existe donc pas de type nommé à
 * importer. Retaper l'union dans un composant en ferait une copie manuelle, exactement ce
 * qu'interdit `portal/CLAUDE.md` — et le jour où le backend ajoute une valeur, le front
 * continuerait de compiler en l'ignorant.
 *
 * En pointant sur le champ du DTO, la source de vérité reste l'OpenAPI : ajouter un état
 * côté backend le propage ici à la régénération, et casse la compilation là où le nouvel
 * état n'est pas traité — ce qui est précisément le service qu'on attend du typage.
 */

type Schemas = components["schemas"]

/** INSCRIT → ACTIF ⇄ INACTIF (§5.9). INACTIF = gel de non-renouvellement (D-034). */
export type MemberStatus = Schemas["MemberProfileDto"]["status"]

/** Vérification d'identité (D-018) — informative, JAMAIS bloquante. */
export type VerificationStatus = Schemas["MemberVerificationDto"]["status"]

export type IdDocumentType = NonNullable<
  Schemas["MemberVerificationDto"]["documentType"]
>

/** Jambe occupée sous l'upline de placement. Nulle pour la racine de l'arbre. */
export type Leg = Schemas["DownlineRowDto"]["rootLeg"]

/** ACTIVE → USED (définitif) · ACTIVE → EXPIRED / REVOKED (rembourse le créateur). */
export type EcardStatus = Schemas["EcardResponseDto"]["status"]

/** MEMBER : la valeur a débité un solde. GENESIS : créée ex nihilo, personne à rembourser. */
export type EcardOrigin = Schemas["EcardResponseDto"]["origin"]

/** ACTIVATION (panier au palier exact) ou FREE (achat libre, sans effet sur l'arbre). */
export type OrderContext = Schemas["OrderResponseDto"]["context"]

export type OrderStatus = Schemas["OrderResponseDto"]["status"]

/** PREPARATION → SHIPPED → DELIVERED. `null` = aucun produit PHYSIQUE dans la commande. */
export type ShipmentStatus = NonNullable<
  Schemas["OrderResponseDto"]["shipmentStatus"]
>

export type ProductType = Schemas["ProductResponseDto"]["type"]

export type LedgerMovementType = Schemas["LedgerEntryResponseDto"]["type"]

/** DIRECT / BALANCE / STARTUP_BONUS / REWARD_POINT (D-031, D-032, D-035). */
export type CommissionEventType = Schemas["RunEventDto"]["type"]

/** PENDING_VALIDATION → VALIDATED : payer ne dégèle pas, l'admin valide (D-038). */
export type MembershipPaymentStatus = NonNullable<
  Schemas["MemberRenewalStateDto"]["lastPaymentStatus"]
>
