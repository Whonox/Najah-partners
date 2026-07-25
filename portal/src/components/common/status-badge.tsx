import { Badge } from "@/components/ui/badge"
import { useT } from "@/i18n/use-t"
import type {
  EcardStatus,
  MemberStatus,
  MembershipPaymentStatus,
  OrderContext,
  ShipmentStatus,
  VerificationStatus,
} from "@/api/enums"

/**
 * Les états du domaine, rendus de façon IDENTIQUE partout : tableau de bord, e-cards,
 * commandes, réseau. Un statut qui change de couleur d'un écran à l'autre force le lecteur à
 * relire le libellé à chaque fois.
 *
 * Aucune couleur en dur : uniquement les variantes sémantiques de `Badge`, dont la palette vit
 * dans `src/index.css`.
 */

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

/**
 * INSCRIT / ACTIF / GELÉ (§5.9).
 *
 * GELÉ (INACTIVE, D-034) est le seul des trois qui appelle une action de l'affilié — il ne
 * perçoit plus rien tant que son renouvellement n'est pas validé —, donc le seul en
 * `destructive`. INSCRIT n'est PAS un problème : un membre peut y rester indéfiniment (D-013),
 * il lui manque seulement une activation.
 */
export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const t = useT()
  const variant: BadgeVariant =
    status === "ACTIVE" ? "default" : status === "INACTIVE" ? "destructive" : "outline"
  return <Badge variant={variant}>{t(`status.${status}`)}</Badge>
}

/**
 * Vérification d'identité (D-018) — INFORMATIVE, jamais bloquante. D'où le registre discret :
 * un `PENDING` ne doit pas se lire comme une alerte, sous peine de laisser croire à l'affilié
 * qu'il l'empêche de s'activer ou de percevoir.
 */
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const t = useT()
  const variant: BadgeVariant =
    status === "VERIFIED" ? "secondary" : status === "REJECTED" ? "destructive" : "outline"
  return <Badge variant={variant}>{t(`verification.${status}`)}</Badge>
}

/**
 * ACTIVE / UTILISÉE / EXPIRÉE / RÉVOQUÉE.
 *
 * USED n'est pas un échec — c'est l'aboutissement normal d'une e-card : elle a payé quelque
 * chose. EXPIRED et REVOKED, en revanche, signalent une valeur qui est REVENUE au solde sans
 * avoir servi : elles méritent d'être repérables d'un coup d'œil dans une liste.
 */
export function EcardStatusBadge({ status }: { status: EcardStatus }) {
  const t = useT()
  const variant: BadgeVariant =
    status === "ACTIVE"
      ? "default"
      : status === "USED"
        ? "secondary"
        : "outline"
  return <Badge variant={variant}>{t(`ecards.status.${status}`)}</Badge>
}

/** ACTIVATION (le panier vaut le palier) vs ACHAT LIBRE (aucun effet sur l'arbre). */
export function OrderContextBadge({ context }: { context: OrderContext }) {
  const t = useT()
  return (
    <Badge variant={context === "ACTIVATION" ? "default" : "outline"}>
      {t(`orders.context.${context}`)}
    </Badge>
  )
}

/** PREPARATION → SHIPPED → DELIVERED. `null` = rien à livrer (aucun produit physique). */
export function ShipmentBadge({
  status,
}: {
  /** `undefined` vient du contrat généré (champ optionnel) : traité comme `null`. */
  status: ShipmentStatus | null | undefined
}) {
  const t = useT()
  if (status === null || status === undefined) {
    return <span className="text-sm text-muted-foreground">{t("orders.shipmentNone")}</span>
  }
  const variant: BadgeVariant =
    status === "DELIVERED" ? "secondary" : status === "SHIPPED" ? "default" : "outline"
  return <Badge variant={variant}>{t(`orders.shipment.${status}`)}</Badge>
}

/**
 * Renouvellement payé (D-038). `PENDING_VALIDATION` est mis en avant parce qu'il dit une
 * chose contre-intuitive : l'argent est parti, et pourtant rien n'a changé pour le membre.
 */
export function RenewalStatusBadge({ status }: { status: MembershipPaymentStatus }) {
  const t = useT()
  return (
    <Badge variant={status === "VALIDATED" ? "secondary" : "default"}>
      {t(`renewalTab.status.${status}`)}
    </Badge>
  )
}
