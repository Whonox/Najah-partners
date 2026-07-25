import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { DataState } from "@/components/common/data-state"
import { Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { profileQueryOptions } from "@/api/queries/me"
import { useT } from "@/i18n/use-t"
import { ActivationFlow } from "./activation-flow"
import { FreePurchase } from "./free-purchase"

/**
 * BOUTIQUE — un aiguillage, pas un écran.
 *
 * Les deux parcours de §7.1.4 n'ont ni les mêmes règles, ni le même vocabulaire, ni le même
 * montant dû. Les présenter dans un même écran, avec des onglets ou une bascule, garantirait
 * qu'un affilié composerait un panier d'activation en croyant faire un achat libre — ou
 * l'inverse. On affiche donc UN SEUL des deux, selon l'état RÉEL du compte :
 *
 *  — INSCRIT (non activé) → activation ;
 *  — ACTIF                → achat libre ;
 *  — GELÉ                 → ni l'un ni l'autre : le backend refuse l'achat libre à un membre
 *    qui n'est pas ACTIF, et il n'y a rien à activer. L'écran le dit et renvoie vers le
 *    renouvellement, plutôt que de laisser composer un panier voué au refus.
 *
 * L'état vient du PROFIL rechargé, pas du token : une activation faite dans un autre onglet
 * doit changer cet écran.
 */
export function ShopPage() {
  const t = useT()
  const profile = useQuery(profileQueryOptions())

  return (
    <div className="space-y-6">
      <PageHeader
        title={profile.data?.status === "REGISTERED" ? t("activation.title") : t("shop.title")}
        description={
          profile.data?.status === "REGISTERED"
            ? t("activation.subtitle")
            : t("shop.subtitleFree")
        }
      />

      <DataState
        isLoading={profile.isPending}
        error={profile.error}
        onRetry={() => void profile.refetch()}
        rows={3}
      >
        {profile.data ? (
          profile.data.status === "REGISTERED" ? (
            <ActivationFlow profile={profile.data} />
          ) : profile.data.status === "ACTIVE" ? (
            <FreePurchase />
          ) : (
            <Notice tone="warning" title={t("status.INACTIVE")}>
              <p>{t("free.requiresActive")}</p>
              <p className="mt-2">{t("status.INACTIVE.help")}</p>
              <Button size="sm" className="mt-3" nativeButton={false} render={<Link to="/profil" />}>
                {t("dashboard.renewCta")}
              </Button>
            </Notice>
          )
        ) : null}
      </DataState>
    </div>
  )
}
