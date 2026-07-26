import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { DataState } from "@/components/common/data-state"
import { Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { profileQueryOptions, type MemberProfile } from "@/api/queries/me"
import { useT } from "@/i18n/use-t"
import { ActivationFlow } from "./activation-flow"
import { FreePurchase } from "./free-purchase"

/**
 * BOUTIQUE — un aiguillage, pas un écran.
 *
 * Les deux parcours de §7.1.4 n'ont ni les mêmes règles, ni le même vocabulaire, ni le même
 * montant dû. Les présenter dans un même écran, avec des onglets ou une bascule, garantirait
 * qu'un affilié composerait un panier d'activation en croyant faire un achat libre — ou
 * l'inverse. On affiche donc UN SEUL des deux, selon l'état du compte :
 *
 *  — INSCRIT (non activé) → activation ;
 *  — ACTIF                → achat libre ;
 *  — GELÉ                 → ni l'un ni l'autre : le backend refuse l'achat libre à un membre
 *    qui n'est pas ACTIF, et il n'y a rien à activer. L'écran le dit et renvoie vers le
 *    renouvellement, plutôt que de laisser composer un panier voué au refus.
 */
type Flow = "activation" | "free" | "frozen"

function flowFor(status: MemberProfile["status"]): Flow {
  if (status === "REGISTERED") return "activation"
  if (status === "ACTIVE") return "free"
  return "frozen"
}

export function ShopPage() {
  const profile = useQuery(profileQueryOptions())

  return (
    <DataState
      isLoading={profile.isPending}
      error={profile.error}
      onRetry={() => void profile.refetch()}
      rows={3}
    >
      {/* Le parcours ne se choisit qu'une fois le profil connu — d'où un composant enfant,
          monté à ce moment-là. C'est lui qui fige la décision (voir ci-dessous). */}
      {profile.data && <ShopFlow profile={profile.data} />}
    </DataState>
  )
}

/**
 * ═══ POURQUOI LE PARCOURS EST FIGÉ À L'ARRIVÉE SUR L'ÉCRAN ═══
 * L'aiguillage relisait le statut à chaque rendu. Or l'activation, en réussissant, FAIT PASSER
 * le membre de INSCRIT à ACTIF — et l'écran remplaçait donc le parcours par la boutique d'achat
 * libre à la seconde même où la confirmation devait s'afficher. On avait payé 2 100 DT et l'on
 * se retrouvait devant un catalogue, sans un mot : ni « c'est fait », ni où aller ensuite.
 *
 * Le choix est donc pris au MONTAGE (initialiseur paresseux de `useState`) et ne bouge plus.
 * Contrepartie assumée : une activation faite dans un AUTRE onglet ne se reflète ici qu'au
 * prochain changement d'écran — la coquille remonte la page sur la route (`key` sur
 * `pathname`). Le coût est nul, le backend refusant de toute façon une seconde activation,
 * alors que perdre la confirmation d'un paiement est un vrai préjudice.
 */
function ShopFlow({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const [flow] = useState<Flow>(() => flowFor(profile.status))

  if (flow === "activation") return <ActivationFlow profile={profile} />
  if (flow === "free") return <FreePurchase />

  return (
    <div className="space-y-5">
      <PageHeader title={t("shop.title")} description={t("shop.subtitleFree")} />
      <Notice tone="warning" title={t("status.INACTIVE")}>
        <p>{t("status.INACTIVE.help")}</p>
        <Button size="sm" className="mt-3" nativeButton={false} render={<Link to="/profil" />}>
          {t("dashboard.renewCta")}
        </Button>
      </Notice>
    </div>
  )
}
