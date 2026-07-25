import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Info,
  Users,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { dashboardQueryOptions } from "@/api/queries/dashboard"
import { BarChart, TrendChart, type ChartPoint } from "@/components/common/chart"
import { DataState } from "@/components/common/data-state"
import { PageHeader } from "@/components/common/page-header"
import { StatCard, TaskCard } from "@/components/common/stat-card"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * Tableau de bord (spec §7.2.1) — la page d'atterrissage après connexion.
 *
 * ORDRE DE LECTURE ASSUMÉ : les TÂCHES d'abord, les chiffres ensuite. Ce que l'admin doit voir
 * en arrivant, ce n'est pas combien de membres existent (ça ne change pas d'une heure à
 * l'autre) : c'est ce qui l'attend. Deux files, deux natures — la vérification d'identité ne
 * bloque personne (D-018), la validation d'un renouvellement décide si un membre gelé
 * recommence à percevoir (D-038). L'écran le dit, sinon elles se ressemblent trop.
 *
 * UN SEUL APPEL alimente tout : douze compteurs sur douze requêtes donneraient douze états de
 * chargement sur la page la plus vue du back-office.
 */
export function DashboardPage() {
  const t = useT()
  const query = useQuery(dashboardQueryOptions())
  const data = query.data

  /** Étiquette d'axe : « 25/07 » — l'année n'apporte rien sur une fenêtre de 30 jours. */
  const dayLabel = (day: string) => day.slice(8, 10) + "/" + day.slice(5, 7)

  const activationPoints: ChartPoint[] =
    data?.series.map((point) => ({
      label: dayLabel(point.day),
      value: point.activations,
    })) ?? []
  const growthPoints: ChartPoint[] =
    data?.series.map((point) => ({
      label: dayLabel(point.day),
      value: point.cumulativeMembers,
    })) ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
      />

      <DataState
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        rows={6}
      >
        {data ? (
          <div className="space-y-6">
            {/* ── 1. LES TÂCHES, en tête d'écran ── */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight">
                {t("dashboard.tasksTitle")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <TaskCard
                  label={t("dashboard.taskIdentity")}
                  count={data.tasks.identityPending}
                  to="/verifications"
                  hint={t("dashboard.taskIdentityHint")}
                  icon={BadgeCheck}
                />
                <TaskCard
                  label={t("dashboard.taskRenewals")}
                  count={data.tasks.renewalsPending}
                  to="/renewals"
                  hint={t("dashboard.taskRenewalsHint")}
                  icon={CalendarClock}
                  blocking
                />
              </div>
            </section>

            {/* ── 2. Le réseau ── */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight">
                {t("dashboard.membersTitle")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label={t("dashboard.membersTotal")}
                  value={data.members.total}
                  icon={Users}
                />
                <StatCard
                  label={t("dashboard.membersActive")}
                  value={data.members.active}
                  hint={t("dashboard.membersActiveHint")}
                />
                <StatCard
                  label={t("dashboard.membersRegistered")}
                  value={data.members.registered}
                  hint={t("dashboard.membersRegisteredHint")}
                />
                <StatCard
                  label={t("dashboard.membersInactive")}
                  value={data.members.inactive}
                  hint={t("dashboard.membersInactiveHint")}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  label={t("dashboard.activationsToday")}
                  value={data.activations.today}
                />
                <StatCard
                  label={t("dashboard.activationsWeek")}
                  value={data.activations.thisWeek}
                  hint={t("dashboard.activationsWeekHint")}
                />
                <StatCard
                  label={t("dashboard.activationsTotal")}
                  value={data.activations.total}
                />
              </div>
            </section>

            {/* ── 3. Les graphes ── */}
            <section className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardContent>
                  <BarChart
                    title={t("dashboard.chartActivations")}
                    total={t("dashboard.chartWindow")}
                    points={activationPoints}
                    valueLabel={t("dashboard.chartActivationsValue")}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <TrendChart
                    title={t("dashboard.chartGrowth")}
                    total={t("dashboard.chartWindow")}
                    points={growthPoints}
                    valueLabel={t("dashboard.chartGrowthValue")}
                  />
                </CardContent>
              </Card>
            </section>

            {/* ── 4. La valeur ── */}
            <section className="grid gap-4 xl:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {t("dashboard.packsTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {data.packs.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                      {t("dashboard.packsEmpty")}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("dashboard.packsColumnPack")}</TableHead>
                          <TableHead>{t("dashboard.packsColumnTier")}</TableHead>
                          <TableHead className="text-end">
                            {t("dashboard.packsColumnMembers")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.packs.map((pack) => (
                          <TableRow key={pack.packId}>
                            <TableCell className="font-medium">
                              {pack.packName}
                            </TableCell>
                            {/* POINTS : entier, jamais aligné comme une colonne d'argent. */}
                            <TableCell>
                              <PointsBv value={pack.tierBv} />
                            </TableCell>
                            <TableCell className="text-end tabular-nums">
                              {pack.memberCount}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {t("dashboard.ecardsTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ValueLine
                    label={`${t("dashboard.ecardsActive")} (${data.ecards.activeCount})`}
                    hint={t("dashboard.ecardsActiveHint")}
                    value={data.ecards.activeValueDt}
                  />
                  <ValueLine
                    label={`${t("dashboard.ecardsUsed")} (${data.ecards.usedCount})`}
                    hint={t("dashboard.ecardsUsedHint")}
                    value={data.ecards.usedValueDt}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {t("dashboard.circulationTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ValueLine
                    label={t("dashboard.circulationBalances")}
                    value={data.circulation.memberBalancesDt}
                  />
                  <ValueLine
                    label={t("dashboard.circulationEcards")}
                    value={data.circulation.activeEcardsDt}
                  />
                  <div className="border-t pt-3">
                    <ValueLine
                      label={t("dashboard.circulationTotal")}
                      value={data.circulation.totalDt}
                      strong
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ── 5. Le moteur ── */}
            <section>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm">
                    {t("dashboard.runTitle")}
                  </CardTitle>
                  <Button variant="outline" size="sm" nativeButton={false}
              render={<Link to="/commissions" />}>
                    {t("dashboard.openCommissions")}
                    <ArrowRight />
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                      {t("dashboard.lastRun")}
                    </p>
                    {data.lastRun ? (
                      <>
                        <p className="text-sm font-medium">
                          {formatDateTime(data.lastRun.executedAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(`runStatus.${data.lastRun.status}`)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("dashboard.lastRunNone")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                      {t("dashboard.runDistributed")}
                    </p>
                    <MoneyDt
                      value={data.lastRun?.distributedDt}
                      className="justify-start text-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("dashboard.runMembers")} : {data.lastRun?.memberCount ?? 0}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                      {t("dashboard.nextRun")}
                    </p>
                    <p className="text-sm font-medium">
                      {formatDateTime(data.nextRunAt)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs tracking-wide text-muted-foreground uppercase">
                      {t("dashboard.totalDistributed")}
                    </p>
                    <MoneyDt
                      value={data.totalDistributedDt}
                      className="justify-start text-lg"
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ── 6. Le rappel qui évite les malentendus les plus coûteux ── */}
            <Alert>
              <Info />
              <AlertTitle>{t("dashboard.twoOverflowsTitle")}</AlertTitle>
              <AlertDescription>{t("dashboard.twoOverflows")}</AlertDescription>
            </Alert>
          </div>
        ) : null}
      </DataState>
    </div>
  )
}

/** Une ligne « libellé → montant en DT », alignée à droite comme toute colonne d'argent. */
function ValueLine({
  label,
  hint,
  value,
  strong = false,
}: {
  label: string
  hint?: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <p className={strong ? "text-sm font-medium" : "text-sm"}>{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <MoneyDt value={value} className={strong ? "text-base" : undefined} />
    </div>
  )
}
