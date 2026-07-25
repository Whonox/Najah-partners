import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { AlertTriangle, Info, Play, X } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectOptions,
  SelectTrigger,
  SelectValue,
  type SelectOption,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RUN_STATUSES, type RunStatus } from "@/api/enums"
import { errorMessage } from "@/api/error"
import {
  pendingEventsQueryOptions,
  runsQueryOptions,
  useRelaunchRun,
  type RunSummary,
  type RunsQuery,
} from "@/api/queries/commissions"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { DataState } from "@/components/common/data-state"
import {
  FilterBar,
  FilterField,
  Pagination,
  TableShell,
} from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import { StatCard } from "@/components/common/stat-card"
import { MoneyDt } from "@/components/format/amount"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

const PAGE_SIZE = 20
const ANY = "__any__"

/**
 * Supervision du moteur (spec §7.2.7). Cet écran REGARDE : le calcul est automatique (cron du
 * vendredi 23:59 Tunis) et rien ici ne le déclenche, sauf la relance de secours.
 *
 * Trois choses que l'écran doit faire comprendre, parce qu'elles sont contre-intuitives :
 *  1. le montant « en attente » est un dû BRUT — le plafond s'applique membre par membre au
 *     moment du run, pas maintenant ;
 *  2. des événements peuvent être tracés et n'être JAMAIS payés (bénéficiaire gelé, D-034) ;
 *  3. il n'existe pas d'annulation de run, et c'est dit à l'écran plutôt que laissé à deviner.
 */
export function CommissionsPage() {
  const t = useT()
  const { hasRole } = useAuth()
  const canRelaunch = hasRole(["SUPER_ADMIN"])

  const [status, setStatus] = useState<RunStatus | undefined>()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [confirmRelaunch, setConfirmRelaunch] = useState(false)

  const query = useMemo<RunsQuery>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(status ? { status } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [page, status, from, to],
  )

  const runs = useQuery(runsQueryOptions(query))
  const pending = useQuery(pendingEventsQueryOptions)
  const relaunch = useRelaunchRun()

  const statusOptions: SelectOption[] = [
    { value: ANY, label: t("commissions.filterStatusAll") },
    ...RUN_STATUSES.map((value) => ({ value, label: t(`runStatus.${value}`) })),
  ]
  const hasFilters = !!status || from !== "" || to !== ""

  function resetFilters() {
    setStatus(undefined)
    setFrom("")
    setTo("")
    setPage(1)
  }

  function runRelaunch() {
    relaunch.mutate(
      {},
      {
        onSuccess: (result) => {
          setConfirmRelaunch(false)
          // Idempotence VISIBLE : « rien n'a été refait » est une information, pas un échec.
          toast.success(
            result.alreadyExecuted
              ? t("commissions.relaunchAlready")
              : t("commissions.relaunched"),
          )
        },
        onError: (error) =>
          toast.error(t("commissions.relaunchFailed"), {
            description: errorMessage(error),
          }),
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("commissions.title")}
        description={t("commissions.description")}
        actions={
          canRelaunch ? (
            <Button variant="outline" onClick={() => setConfirmRelaunch(true)}>
              <Play />
              {t("commissions.relaunch")}
            </Button>
          ) : null
        }
      />

      {/* Ce que le prochain run paiera. En tête : c'est la question qu'un affilié pose. */}
      <DataState
        isLoading={pending.isPending}
        error={pending.error}
        onRetry={() => void pending.refetch()}
        rows={2}
      >
        {pending.data ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {t("commissions.pendingTitle")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(pending.data.periodStart)} →{" "}
                {formatDateTime(pending.data.periodEnd)}
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t("commissions.pendingEvents")}
                value={pending.data.eventCount}
              />
              <StatCard
                label={t("commissions.pendingMembers")}
                value={pending.data.memberCount}
              />
              <StatCard
                label={t("commissions.pendingEligible")}
                value={<MoneyDt value={pending.data.eligibleGrossDt} className="justify-start" />}
                hint={t("commissions.pendingHint")}
              />
              <StatCard
                label={t("commissions.pendingIneligible")}
                value={
                  <MoneyDt
                    value={pending.data.ineligibleGrossDt}
                    className="justify-start"
                  />
                }
                hint={t("commissions.pendingIneligibleHint")}
              />
            </CardContent>
          </Card>
        ) : null}
      </DataState>

      <FilterBar>
        <FilterField label={t("commissions.filterStatus")} className="w-44">
          <Select
            options={statusOptions}
            value={status ?? ANY}
            onValueChange={(value) => {
              setStatus(value === ANY ? undefined : (value as RunStatus))
              setPage(1)
            }}
          >
            <SelectTrigger aria-label={t("commissions.filterStatus")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptions options={statusOptions} />
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t("common.from")} htmlFor="runs-from">
          <Input
            id="runs-from"
            type="date"
            value={from}
            className="w-40"
            onChange={(event) => {
              setFrom(event.target.value)
              setPage(1)
            }}
          />
        </FilterField>

        <FilterField label={t("common.to")} htmlFor="runs-to">
          <Input
            id="runs-to"
            type="date"
            value={to}
            className="w-40"
            onChange={(event) => {
              setTo(event.target.value)
              setPage(1)
            }}
          />
        </FilterField>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X />
            {t("common.reset")}
          </Button>
        ) : null}
      </FilterBar>

      <DataState
        isLoading={runs.isPending}
        error={runs.error}
        isEmpty={runs.data?.items.length === 0}
        onRetry={() => void runs.refetch()}
        rows={8}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t("commissions.column.run")}</TableHead>
                <TableHead>{t("commissions.column.period")}</TableHead>
                <TableHead className="w-40">
                  {t("commissions.column.executedAt")}
                </TableHead>
                <TableHead className="w-24 text-end">
                  {t("commissions.column.members")}
                </TableHead>
                <TableHead className="w-40 text-end">
                  {t("commissions.column.distributed")}
                </TableHead>
                <TableHead className="w-28 text-end">
                  {t("commissions.column.rewardPoints")}
                </TableHead>
                <TableHead className="w-24">
                  {t("commissions.column.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.data?.items.map((run) => <RunRow key={run.id} run={run} />)}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {/* État vide EXPLICITE : « aucun run sur cette période » et non « aucune donnée ». */}
      {runs.data?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("commissions.emptyRuns")}</p>
      ) : null}

      {runs.data ? (
        <Pagination
          page={runs.data.page}
          pageSize={runs.data.pageSize}
          total={runs.data.total}
          onPageChange={setPage}
        />
      ) : null}

      <Alert>
        <Info />
        <AlertTitle>{t("commissions.runLostHint")}</AlertTitle>
        <AlertDescription>{t("commissions.noRollback")}</AlertDescription>
      </Alert>

      {!canRelaunch ? (
        <p className="text-xs text-muted-foreground">
          {t("commissions.superAdminOnly")}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmRelaunch}
        title={t("commissions.relaunchTitle")}
        description={t("commissions.relaunchDescription")}
        consequence={t("commissions.relaunchConsequence")}
        confirmLabel={t("commissions.relaunchConfirm")}
        destructive={false}
        pending={relaunch.isPending}
        onConfirm={runRelaunch}
        onCancel={() => setConfirmRelaunch(false)}
      />
    </div>
  )
}

function RunRow({ run }: { run: RunSummary }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Link
          to={`/commissions/${run.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          #{run.id}
        </Link>
      </TableCell>
      <TableCell className="text-xs">
        {formatDateTime(run.periodStart)} → {formatDateTime(run.periodEnd)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDateTime(run.executedAt)}
      </TableCell>
      <TableCell className="text-end tabular-nums">{run.memberCount}</TableCell>
      <TableCell className="text-end">
        <MoneyDt value={run.distributedDt} />
      </TableCell>
      {/* Points Fidélité : 3ᵉ unité (D-032) — ni dinars, ni points d'arbre. */}
      <TableCell className="text-end tabular-nums">
        {run.rewardPointsGranted}
      </TableCell>
      <TableCell>
        <RunStatusBadge status={run.status} />
      </TableCell>
    </TableRow>
  )
}

/**
 * Statut d'un run. `ERROR` est le seul qui appelle une action (un rattrapage) : c'est donc le
 * seul en registre d'alerte — un run réussi n'a pas à attirer l'œil.
 */
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const t = useT()
  const variant =
    status === "SUCCESS" ? "secondary" : status === "ERROR" ? "destructive" : "outline"

  return (
    <Badge variant={variant}>
      {status === "ERROR" ? <AlertTriangle className="size-3" /> : null}
      {t(`runStatus.${status}`)}
    </Badge>
  )
}
