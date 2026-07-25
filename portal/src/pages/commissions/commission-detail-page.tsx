import { Link, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, ArrowLeft, Gift, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataState } from "@/components/common/data-state"
import { Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { MoneyDt } from "@/components/format/amount"
import { myRunEventsQueryOptions, type RunEvent } from "@/api/queries/commissions"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * « POURQUOI CE MONTANT ? » — la chronologie d'une semaine, commission par commission.
 *
 * L'ORDRE EST CELUI DU PLAFOND, pas celui d'un tri d'affichage : `(occurredAt, id)`, exactement
 * celui qu'a suivi le run (D-033 — sur une même activation, la commission DIRECTE précède les
 * ÉQUILIBRES). Le retrier par montant ou par type rendrait la colonne « cumul avant »
 * incompréhensible, et c'est elle qui explique tout.
 *
 * Trois marqueurs portent l'essentiel de l'explication :
 *  — « franchit le plafond » : la ligne payée PARTIELLEMENT, après quoi plus rien de la
 *    semaine n'est versé ;
 *  — « Point Fidélité perdu » : l'équilibre du 6ᵉ rang survenu après le plafond ne donne rien ;
 *  — « non versée » : commission née alors que le compte n'était pas actif (D-034) — tracée,
 *    jamais payable. Elle affiche 0 en « perdu » et non son montant : cette somme n'a jamais
 *    été due, et la compter comme perdue casserait l'égalité « perdu = brut − versé ».
 */
export function CommissionDetailPage() {
  const t = useT()
  const params = useParams()
  const runId = Number(params.runId)
  const detail = useQuery(myRunEventsQueryOptions(runId))

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/gains" />}>
        <ArrowLeft />
        {t("commissionDetail.back")}
      </Button>

      <DataState
        isLoading={detail.isPending}
        error={detail.error}
        onRetry={() => void detail.refetch()}
        rows={4}
      >
        {detail.data ? (
          <div className="space-y-6">
            <PageHeader title={t("commissionDetail.title")} />

            <Card>
              <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
                <Figure
                  label={t("commissions.gross")}
                  value={<MoneyDt value={detail.data.grossDt} />}
                />
                <Figure
                  label={t("commissions.paid")}
                  value={<MoneyDt value={detail.data.paidDt} className="text-lg" />}
                />
                <Figure
                  label={t("commissions.lost")}
                  value={<MoneyDt value={detail.data.lostDt} />}
                />
                <Figure
                  label={t("commissions.cap")}
                  value={<MoneyDt value={detail.data.appliedCapDt} />}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("commissionDetail.chronology")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Notice icon={<Info className="size-4 shrink-0" aria-hidden />}>
                  {t("commissionDetail.chronologyHint")}
                </Notice>

                <ol className="space-y-3">
                  {detail.data.events.map((event) => (
                    <li key={event.id}>
                      <EventRow event={event} />
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DataState>
    </div>
  )
}

function EventRow({ event }: { event: RunEvent }) {
  const t = useT()

  return (
    <div
      className={
        event.crossesCap
          ? "rounded-lg border border-warning/40 bg-warning/10 p-3"
          : "rounded-lg border bg-card p-3"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{t(`eventType.${event.type}`)}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(event.occurredAt)}
          </p>
        </div>
        <MoneyDt value={event.amountDt} className="text-lg" />
      </div>

      {/* D'où vient la commission : le membre dont l'activation l'a déclenchée. */}
      {event.sourceMember ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("commissionDetail.from")} {event.sourceMember.firstName}{" "}
          {event.sourceMember.lastName}{" "}
          <span className="font-mono text-xs">({event.sourceMember.memberCode})</span>
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {event.balanceIndex !== null && event.balanceIndex !== undefined ? (
          <Badge variant="outline">
            {t("commissionDetail.balanceIndex", { index: event.balanceIndex })}
          </Badge>
        ) : null}
        {event.rewardPointGranted ? (
          <Badge variant="secondary">
            <Gift className="size-3" aria-hidden />
            {t("commissionDetail.rewardGranted")}
          </Badge>
        ) : null}
        {event.rewardPointLost ? (
          <Badge variant="outline">{t("commissionDetail.rewardLost")}</Badge>
        ) : null}
        {!event.eligible ? (
          <Badge variant="destructive">{t("commissionDetail.ineligible")}</Badge>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-sm">
        <Figure
          label={t("commissionDetail.cumulative")}
          value={<MoneyDt value={event.cumulativeBeforeDt} className="text-sm" />}
          small
        />
        <Figure
          label={t("commissionDetail.paid")}
          value={<MoneyDt value={event.paidDt} className="text-sm" />}
          small
        />
        <Figure
          label={t("commissionDetail.lost")}
          value={<MoneyDt value={event.lostDt} className="text-sm" />}
          small
        />
      </dl>

      {event.crossesCap ? (
        <p className="mt-2 flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">{t("commissionDetail.crossesCap")}</span>{" "}
            {t("commissionDetail.crossesCapHint")}
          </span>
        </p>
      ) : null}

      {!event.eligible ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("commissionDetail.ineligibleHint")}
        </p>
      ) : null}
    </div>
  )
}

function Figure({
  label,
  value,
  small,
}: {
  label: string
  value: React.ReactNode
  small?: boolean
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={small ? "font-medium" : "text-lg font-semibold"}>{value}</dd>
    </div>
  )
}
