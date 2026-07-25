import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import { ArrowLeft, Info } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  runMemberEventsQueryOptions,
  runMembersQueryOptions,
  runQueryOptions,
  type RunEvent,
  type RunMemberRow,
} from "@/api/queries/commissions"
import { DataState } from "@/components/common/data-state"
import { Pagination, TableShell } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import { StatCard } from "@/components/common/stat-card"
import { MoneyDt } from "@/components/format/amount"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { RunStatusBadge } from "./commissions-page"

/**
 * Détail d'un run (spec §7.2.7) : les totaux, puis la décomposition par membre, puis — au clic —
 * la CHRONOLOGIE d'un membre.
 *
 * Cette chronologie est la raison d'être de l'écran : c'est elle qui permet à un admin de
 * répondre à « pourquoi ai-je touché 10 000 et pas 11 000 ? ». Elle montre, dans l'ordre réel
 * d'application du plafond, ce que chaque événement a payé et ce qu'il a perdu — y compris
 * l'événement à cheval, payé pour moitié.
 */
export function RunDetailPage() {
  const t = useT()
  const params = useParams()
  const runId = Number(params.runId)

  const [page, setPage] = useState(1)
  const [openMemberId, setOpenMemberId] = useState<number | null>(null)

  const run = useQuery(runQueryOptions(runId))
  const members = useQuery(runMembersQueryOptions(runId, page))

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ms-2" nativeButton={false}
              render={<Link to="/commissions" />}>
        <ArrowLeft />
        {t("commissions.runBack")}
      </Button>

      <DataState
        isLoading={run.isPending}
        error={run.error}
        onRetry={() => void run.refetch()}
        rows={4}
      >
        {run.data ? (
          <div className="space-y-6">
            <PageHeader
              title={`${t("commissions.runTitle")} #${run.data.run.id}`}
              description={`${formatDateTime(run.data.run.periodStart)} → ${formatDateTime(
                run.data.run.periodEnd,
              )}`}
              actions={<RunStatusBadge status={run.data.run.status} />}
            />

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t("commissions.runGross")}
                value={<MoneyDt value={run.data.grossTotalDt} className="justify-start" />}
              />
              <StatCard
                label={t("commissions.runPaid")}
                value={
                  <MoneyDt value={run.data.run.distributedDt} className="justify-start" />
                }
                hint={`${t("commissions.runMembers")} : ${run.data.run.memberCount}`}
              />
              {/* L'information la plus contre-intuitive de la plateforme : de l'argent PERDU. */}
              <StatCard
                label={t("commissions.runLost")}
                value={<MoneyDt value={run.data.lostTotalDt} className="justify-start" />}
                hint={t("commissions.runLostHint")}
              />
              <StatCard
                label={t("commissions.runEvents")}
                value={run.data.eventCount}
                hint={`${t("commissions.runIneligible")} : ${run.data.ineligibleEventCount}`}
              />
            </section>

            {run.data.unsettledMemberCount > 0 ? (
              <Alert>
                <Info />
                <AlertTitle>
                  {t("commissions.runUnsettled")} : {run.data.unsettledMemberCount}
                </AlertTitle>
                <AlertDescription>
                  {t("commissions.runUnsettledHint")}
                </AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("commissions.runLog")}</CardTitle>
              </CardHeader>
              <CardContent>
                {run.data.log ? (
                  <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                    {run.data.log}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("commissions.runLogNone")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DataState>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">
          {t("commissions.membersTitle")}
        </h2>

        <DataState
          isLoading={members.isPending}
          error={members.error}
          isEmpty={members.data?.items.length === 0}
          onRetry={() => void members.refetch()}
          rows={6}
        >
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">{t("common.member")}</TableHead>
                  <TableHead>{t("ledger.column.name")}</TableHead>
                  <TableHead className="w-36 text-end">
                    {t("commissions.column.gross")}
                  </TableHead>
                  <TableHead className="w-36 text-end">
                    {t("commissions.column.paid")}
                  </TableHead>
                  <TableHead className="w-36 text-end">
                    {t("commissions.column.lost")}
                  </TableHead>
                  <TableHead className="w-36 text-end">
                    {t("commissions.column.cap")}
                  </TableHead>
                  <TableHead className="w-24 text-end">
                    {t("commissions.column.events")}
                  </TableHead>
                  <TableHead className="w-28 text-end">
                    {t("commissions.column.rewardPoints")}
                  </TableHead>
                  <TableHead className="w-28">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data?.items.map((row) => (
                  <MemberSettlementRow
                    key={row.member.id}
                    row={row}
                    onOpen={() => setOpenMemberId(row.member.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </DataState>

        {members.data?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("commissions.emptyMembers")}
          </p>
        ) : null}

        {members.data ? (
          <Pagination
            page={members.data.page}
            pageSize={members.data.pageSize}
            total={members.data.total}
            onPageChange={setPage}
          />
        ) : null}
      </section>

      {openMemberId !== null ? (
        <ChronologyDialog
          runId={runId}
          memberId={openMemberId}
          onClose={() => setOpenMemberId(null)}
        />
      ) : null}
    </div>
  )
}

function MemberSettlementRow({
  row,
  onOpen,
}: {
  row: RunMemberRow
  onOpen: () => void
}) {
  const t = useT()
  const lost = Number(row.lostDt) > 0

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Link
          to={`/members/${row.member.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {row.member.memberCode}
        </Link>
      </TableCell>
      <TableCell className="font-medium">
        {row.member.lastName} {row.member.firstName}
      </TableCell>
      <TableCell className="text-end">
        <MoneyDt value={row.grossDt} />
      </TableCell>
      <TableCell className="text-end">
        <MoneyDt value={row.paidDt} />
      </TableCell>
      {/* Le perdu ne prend la teinte d'alerte que s'il est NON NUL : sinon la colonne entière
          se lirait comme un problème permanent. */}
      <TableCell className="text-end">
        <MoneyDt value={row.lostDt} className={lost ? "text-destructive" : undefined} />
      </TableCell>
      <TableCell className="text-end">
        <MoneyDt value={row.appliedCapDt} className="text-muted-foreground" />
      </TableCell>
      <TableCell className="text-end tabular-nums">{row.eventCount}</TableCell>
      <TableCell className="text-end text-xs tabular-nums">
        {row.rewardPointsGranted}
        {row.rewardPointsLost > 0 ? (
          <span className="text-destructive"> (−{row.rewardPointsLost})</span>
        ) : null}
      </TableCell>
      <TableCell>
        <Button variant="outline" size="sm" onClick={onOpen}>
          {t("commissions.seeChronology")}
        </Button>
      </TableCell>
    </TableRow>
  )
}

/**
 * La chronologie d'un membre. Chargée à l'ouverture seulement — la précharger pour les deux
 * cents membres d'un run ferait deux cents requêtes pour une seule qu'on lira.
 */
function ChronologyDialog({
  runId,
  memberId,
  onClose,
}: {
  runId: number
  memberId: number
  onClose: () => void
}) {
  const t = useT()
  const query = useQuery(runMemberEventsQueryOptions(runId, memberId))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("commissions.chronologyTitle")}</DialogTitle>
          <DialogDescription>{t("commissions.chronologyHint")}</DialogDescription>
        </DialogHeader>

        <DataState
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          rows={5}
        >
          {query.data ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="font-mono text-xs">
                  {query.data.member.memberCode}
                </span>
                <span className="font-medium">
                  {query.data.member.lastName} {query.data.member.firstName}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <StatCard
                  label={t("commissions.runGross")}
                  value={<MoneyDt value={query.data.grossDt} className="justify-start" />}
                />
                <StatCard
                  label={t("commissions.runPaid")}
                  value={<MoneyDt value={query.data.paidDt} className="justify-start" />}
                />
                <StatCard
                  label={t("commissions.runLost")}
                  value={<MoneyDt value={query.data.lostDt} className="justify-start" />}
                />
                <StatCard
                  label={t("commissions.column.cap")}
                  value={
                    query.data.appliedCapDt ? (
                      <MoneyDt value={query.data.appliedCapDt} className="justify-start" />
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t("commissions.capNone")}
                      </span>
                    )
                  }
                />
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("commissions.column.eventType")}</TableHead>
                      <TableHead className="w-28">
                        {t("commissions.column.source")}
                      </TableHead>
                      <TableHead className="w-36">
                        {t("commissions.column.occurredAt")}
                      </TableHead>
                      <TableHead className="w-32 text-end">
                        {t("commissions.column.eventAmount")}
                      </TableHead>
                      <TableHead className="w-32 text-end">
                        {t("commissions.column.cumulative")}
                      </TableHead>
                      <TableHead className="w-32 text-end">
                        {t("commissions.column.eventPaid")}
                      </TableHead>
                      <TableHead className="w-32 text-end">
                        {t("commissions.column.eventLost")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.events.map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {query.data.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("commissions.emptyEvents")}
                </p>
              ) : null}
            </div>
          ) : null}
        </DataState>
      </DialogContent>
    </Dialog>
  )
}

function EventRow({ event }: { event: RunEvent }) {
  const t = useT()

  return (
    <TableRow className={event.eligible ? undefined : "opacity-60"}>
      <TableCell className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{t(`eventType.${event.type}`)}</span>
          {event.balanceIndex !== null ? (
            <Badge variant="outline">
              {t("commissions.balanceIndex")}
              {event.balanceIndex}
            </Badge>
          ) : null}
          {event.crossesCap ? (
            <Badge variant="destructive" title={t("commissions.crossesCapHint")}>
              {t("commissions.crossesCap")}
            </Badge>
          ) : null}
          {event.rewardPointGranted ? (
            <Badge variant="secondary">{t("commissions.rewardGranted")}</Badge>
          ) : null}
          {event.rewardPointLost ? (
            <Badge variant="destructive">{t("commissions.rewardLost")}</Badge>
          ) : null}
        </div>
        {!event.eligible ? (
          <p className="text-xs text-destructive">{t("commissions.ineligibleRow")}</p>
        ) : null}
      </TableCell>
      <TableCell className="font-mono text-xs">
        <Link
          to={`/members/${event.sourceMember.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {event.sourceMember.memberCode}
        </Link>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDateTime(event.occurredAt)}
      </TableCell>
      <TableCell className="text-end">
        <MoneyDt value={event.amountDt} />
      </TableCell>
      <TableCell className="text-end">
        <MoneyDt value={event.cumulativeBeforeDt} className="text-muted-foreground" />
      </TableCell>
      <TableCell className="text-end">
        <MoneyDt value={event.paidDt} />
      </TableCell>
      <TableCell className="text-end">
        <MoneyDt
          value={event.lostDt}
          className={Number(event.lostDt) > 0 ? "text-destructive" : undefined}
        />
      </TableCell>
    </TableRow>
  )
}
