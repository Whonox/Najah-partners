import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { DataState } from "@/components/common/data-state"
import { Explain } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { Pager } from "@/components/common/pager"
import { StatCard } from "@/components/common/stat-card"
import { Surface } from "@/components/common/surface"
import { MoneyDt, RewardPoints } from "@/components/format/amount"
import {
  myCommissionsQueryOptions,
  type MyCommissionRow,
} from "@/api/queries/commissions"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

const PAGE_SIZE = 10

/**
 * MES GAINS, SEMAINE PAR SEMAINE (spec §7.1).
 *
 * ═══ CET ÉCRAN EXISTE POUR ÉVITER DES RÉCLAMATIONS ═══
 * Un affilié qui voit « 750 DT » sans savoir d'où ils viennent écrit au support ; un affilié
 * qui voit « 1 000 DT dus, 750 versés » sans explication écrit deux fois. Chaque ligne porte
 * donc sa VENTILATION (combien de directes, combien d'équilibres, un bonus) et, lorsqu'il y a
 * eu écrêtement, le dit en toutes lettres avec le lien vers le détail.
 *
 * La ventilation vient du backend, du MÊME service que la supervision du back-office (D-047) :
 * l'affilié et le gestionnaire lisent la même explication d'un même versement. Aucun chiffre
 * n'est recalculé ici — pas même une soustraction : `lostDt` est rendu par l'API.
 */
export function CommissionsPage() {
  const t = useT()
  const [page, setPage] = useState(1)
  const commissions = useQuery(myCommissionsQueryOptions({ page, pageSize: PAGE_SIZE }))

  const total = commissions.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader title={t("commissions.title")} description={t("commissions.subtitle")} />

      {commissions.data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            tone="highlight"
            label={t("commissions.lifetimePaid")}
            value={<MoneyDt value={commissions.data.lifetimePaidDt} />}
          />
          <StatCard
            label={t("commissions.lifetimeLost")}
            hint={t("explain.cap.body")}
            value={<MoneyDt value={commissions.data.lifetimeLostDt} />}
          />
        </div>
      ) : null}

      <Explain titleKey="explain.cap.title" bodyKey="explain.cap.body" />

      <DataState
        isLoading={commissions.isPending}
        error={commissions.error}
        isEmpty={commissions.data?.items.length === 0}
        emptyMessage={t("commissions.emptyHint")}
        onRetry={() => void commissions.refetch()}
      >
        <ul className="space-y-3">
          {(commissions.data?.items ?? []).map((row) => (
            <li key={row.runId}>
              <WeekCard row={row} />
            </li>
          ))}
        </ul>

        <Pager page={page} pages={pages} onChange={setPage} />
      </DataState>
    </div>
  )
}

function WeekCard({ row }: { row: MyCommissionRow }) {
  const t = useT()
  // « A-t-on perdu quelque chose ? » vient du montant rendu par l'API, jamais d'une
  // comparaison au plafond refaite ici : le plafond s'applique événement par événement, en
  // chronologie, et le refaire côté écran finirait par raconter autre chose que le run.
  const capped = Number(row.lostDt) > 0

  return (
    <Link to={`/gains/${row.runId}`} className="block">
      <Surface variant="card" className="space-y-3 transition-colors hover:bg-muted">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {t("commissions.week", { date: formatDateTime(row.periodEnd) })}
            </p>
            <p className="mt-1 text-2xl font-semibold">
              <MoneyDt value={row.paidDt} />
            </p>
          </div>
          <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
        </div>

        {/* La ventilation : d'OÙ vient ce montant. */}
        <div className="flex flex-wrap gap-2">
          {row.directCount > 0 ? (
            <Badge variant="outline">
              {t("commissions.direct", { count: row.directCount })}
            </Badge>
          ) : null}
          {row.balanceCount > 0 ? (
            <Badge variant="outline">
              {t("commissions.balance", { count: row.balanceCount })}
            </Badge>
          ) : null}
          {row.startupBonusCount > 0 ? (
            <Badge variant="outline">{t("commissions.startup")}</Badge>
          ) : null}
          {row.rewardPointsGranted > 0 ? (
            <Badge variant="secondary">
              <RewardPoints value={row.rewardPointsGranted} />
            </Badge>
          ) : null}
        </div>

        {capped ? (
          <div className="rounded-xl bg-warning/10 p-3 ring-1 ring-warning/40">
            <p className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t("commissions.capped")}
            </p>
            <p className="mt-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{t("commissions.lost")}</span>
              <MoneyDt value={row.lostDt} />
            </p>
            {row.rewardPointsLost > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("commissions.rewardLost", { count: row.rewardPointsLost })}
              </p>
            ) : null}
          </div>
        ) : null}

        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Pair label={t("commissions.gross")} value={<MoneyDt value={row.grossDt} />} />
          <Pair label={t("commissions.cap")} value={<MoneyDt value={row.appliedCapDt} />} />
          <Pair label={t("commissions.events", { count: row.eventCount })} value={null} />
        </dl>
      </Surface>
    </Link>
  )
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      {value ? <dd>{value}</dd> : null}
    </div>
  )
}
