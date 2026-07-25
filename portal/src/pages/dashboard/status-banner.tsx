import { useState } from "react"
import { Link } from "react-router"
import { AlertTriangle, ArrowRight, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/common/explain"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import type { MemberDashboard } from "@/api/queries/me"

/** Fenêtre au-delà de laquelle une échéance de renouvellement n'a pas à être rappelée. */
const SOON_DAYS = 30

/**
 * CE QUI DEMANDE UNE ACTION, tout en haut de l'accueil.
 *
 * Trois situations, et une seule peut s'afficher à la fois — empiler trois bandeaux
 * d'avertissement revient à n'en afficher aucun, l'œil les traite comme du décor :
 *
 *  1. compte GELÉ : la plus grave. Il ne perçoit plus rien, et c'est réversible ;
 *  2. renouvellement PAYÉ mais pas encore validé : contre-intuitif au point de mériter son
 *     propre message — l'argent est parti, et pourtant rien n'a changé (D-038) ;
 *  3. compte INSCRIT non activé : il a une place dans l'arbre mais aucune commission.
 *
 * L'échéance PROCHE (moins de 30 jours) n'apparaît que si rien de plus grave ne s'affiche :
 * un membre déjà gelé n'a pas besoin qu'on lui rappelle une date, il a besoin de payer.
 */
export function StatusBanner({ dashboard }: { dashboard: MemberDashboard }) {
  const t = useT()
  const { status, renewal } = dashboard
  // L'heure courante est lue UNE FOIS, à l'ouverture de l'écran, et non à chaque rendu :
  // une valeur qui change d'un rendu à l'autre rend le composant impur, et le bandeau
  // pourrait apparaître ou disparaître sur un simple re-rendu sans que rien n'ait changé.
  const [now] = useState(() => Date.now())

  const pendingValidation = renewal.lastPaymentStatus === "PENDING_VALIDATION"

  if (status === "INACTIVE") {
    return (
      <Notice
        tone="warning"
        title={t("status.INACTIVE")}
        icon={<AlertTriangle className="size-4 shrink-0" aria-hidden />}
      >
        <p>{t("status.INACTIVE.help")}</p>
        {pendingValidation ? (
          <p className="mt-2 font-medium text-foreground">
            {t("renewal.pendingValidation")}
          </p>
        ) : (
          <Button size="sm" className="mt-3" nativeButton={false} render={<Link to="/profil" />}>
            {t("dashboard.renewCta")}
            <ArrowRight />
          </Button>
        )}
      </Notice>
    )
  }

  if (pendingValidation) {
    return (
      <Notice
        tone="warning"
        title={t("renewal.pendingValidation")}
        icon={<Clock className="size-4 shrink-0" aria-hidden />}
      >
        {t("renewal.pendingValidationHelp")}
      </Notice>
    )
  }

  if (status === "REGISTERED") {
    return (
      <Notice tone="warning" title={t("status.REGISTERED")}>
        <p>{t("status.REGISTERED.help")}</p>
        <Button size="sm" className="mt-3" nativeButton={false} render={<Link to="/boutique" />}>
          {t("dashboard.activateCta")}
          <ArrowRight />
        </Button>
      </Notice>
    )
  }

  if (renewal.renewalAt) {
    const dueAt = new Date(renewal.renewalAt)
    const days = (dueAt.getTime() - now) / 86_400_000
    if (days <= SOON_DAYS) {
      return (
        <Notice tone="warning" icon={<Clock className="size-4 shrink-0" aria-hidden />}>
          <p>
            {t(days < 0 ? "renewal.overdue" : "renewal.dueSoon", {
              date: formatDateTime(dueAt),
            })}
          </p>
          <Button size="sm" variant="outline" className="mt-3" nativeButton={false} render={<Link to="/profil" />}>
            {t("dashboard.renewCta")}
          </Button>
        </Notice>
      )
    }
  }

  return null
}
