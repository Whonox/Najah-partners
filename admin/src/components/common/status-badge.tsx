import { Badge } from "@/components/ui/badge"
import { useT } from "@/i18n/use-t"
import type { TranslationKey } from "@/i18n/fr"
import type {
  MemberStatus,
  OrderContext,
  ShipmentStatus,
  VerificationStatus,
} from "@/api/enums"

/**
 * Les états du domaine, rendus de façon IDENTIQUE partout : liste des membres, fiche, arbre,
 * commandes. Un statut qui change de couleur d'un écran à l'autre force l'utilisateur à
 * relire le libellé à chaque fois — sur un outil consulté des heures, c'est du temps perdu
 * en permanence.
 *
 * Aucune couleur en dur : uniquement les variantes sémantiques de `Badge`, dont la palette
 * vit dans `src/index.css`. Le registre reste sobre (admin/CLAUDE.md) — la couleur SIGNALE,
 * elle ne décore pas : seul l'état qui demande une attention (gelé, expédition en attente)
 * sort du gris.
 */

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

function useStatusBadge(labelKey: TranslationKey, variant: BadgeVariant) {
  const t = useT()
  return { label: t(labelKey), variant }
}

/**
 * INSCRIT / ACTIF / INACTIF (§5.9). INACTIF est le GEL de non-renouvellement (D-034) :
 * c'est le seul des trois qui appelle une action de l'administration, donc le seul en
 * `destructive`. INSCRIT n'est pas un problème — un membre peut y rester indéfiniment (D-013).
 */
export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const variant: BadgeVariant =
    status === "ACTIVE"
      ? "default"
      : status === "INACTIVE"
        ? "destructive"
        : "outline"
  const { label } = useStatusBadge(`memberStatus.${status}`, variant)
  return <Badge variant={variant}>{label}</Badge>
}

/**
 * Vérification d'identité (D-018) — INFORMATIVE, jamais bloquante : un membre `PENDING`
 * s'inscrit, s'active, perçoit et renouvelle normalement. D'où le registre discret : un
 * `PENDING` ne doit pas se lire comme une alerte, sous peine de laisser croire qu'il bloque
 * quelque chose.
 */
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const variant: BadgeVariant =
    status === "VERIFIED"
      ? "secondary"
      : status === "REJECTED"
        ? "destructive"
        : "outline"
  const { label } = useStatusBadge(`verification.${status}`, variant)
  return <Badge variant={variant}>{label}</Badge>
}

/** ACTIVATION (le panier vaut le palier) vs FREE (achat libre, aucun effet sur l'arbre). */
export function OrderContextBadge({ context }: { context: OrderContext }) {
  const variant: BadgeVariant = context === "ACTIVATION" ? "default" : "outline"
  const { label } = useStatusBadge(`orderContext.${context}`, variant)
  return <Badge variant={variant}>{label}</Badge>
}

/**
 * PREPARATION → SHIPPED → DELIVERED, et jamais en arrière. `PREPARATION` est mis en avant :
 * c'est la seule étape qui attend quelqu'un — la file de travail de la logistique.
 */
export function ShipmentBadge({ status }: { status: ShipmentStatus | null }) {
  const t = useT()
  if (status === null) {
    // Aucun produit PHYSIQUE : il n'y a rien à expédier, ce n'est pas une étape « en attente ».
    return <span className="text-muted-foreground">{t("shipment.none")}</span>
  }
  const variant: BadgeVariant =
    status === "DELIVERED"
      ? "secondary"
      : status === "PREPARATION"
        ? "default"
        : "outline"
  return <Badge variant={variant}>{t(`shipment.${status}`)}</Badge>
}

/** Actif / inactif d'un pack ou d'un produit — le vocabulaire du catalogue, pas de l'adhésion. */
export function ActiveBadge({ active }: { active: boolean }) {
  const t = useT()
  return (
    <Badge variant={active ? "secondary" : "outline"}>
      {t(active ? "common.active" : "common.inactive")}
    </Badge>
  )
}
