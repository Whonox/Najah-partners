import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Download, Info, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  activationsByPackQueryOptions,
  circulationQueryOptions,
  commissionsReportQueryOptions,
  salesReportQueryOptions,
  topAffiliatesQueryOptions,
  type ReportPeriod,
} from "@/api/queries/reports"
import { DataState } from "@/components/common/data-state"
import { FilterBar, FilterField, TableShell } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { csvFilename, downloadCsv, type CsvColumn } from "@/lib/csv"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * Rapports & analytics (spec §7.2.10). Registre SOBRE : des tableaux, des totaux, et les exports.
 * Pas de graphe décoratif — les deux graphes utiles vivent sur le tableau de bord, là où on
 * regarde une tendance ; ici on lit des chiffres qu'on va recopier ailleurs.
 *
 * L'EXPORT reprend exactement le tableau affiché, avec les montants en valeur BRUTE (« 2100.000 »
 * et non « 2 100,000 ») : un tableur ne sait pas lire une espace fine insécable comme un
 * séparateur de milliers.
 */
export function ReportsPage() {
  const t = useT()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const period = useMemo<ReportPeriod>(
    () => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    [from, to],
  )
  const hasPeriod = from !== "" || to !== ""

  return (
    <div className="space-y-6">
      <PageHeader title={t("reports.title")} description={t("reports.description")} />

      <FilterBar>
        <FilterField label={t("common.from")} htmlFor="reports-from">
          <Input
            id="reports-from"
            type="date"
            value={from}
            className="w-40"
            onChange={(event) => setFrom(event.target.value)}
          />
        </FilterField>
        <FilterField label={t("common.to")} htmlFor="reports-to">
          <Input
            id="reports-to"
            type="date"
            value={to}
            className="w-40"
            onChange={(event) => setTo(event.target.value)}
          />
        </FilterField>
        {hasPeriod ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("")
              setTo("")
            }}
          >
            <X />
            {t("common.reset")}
          </Button>
        ) : (
          <span className="pb-2 text-xs text-muted-foreground">
            {t("reports.periodAll")}
          </span>
        )}
      </FilterBar>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">{t("reports.tabSales")}</TabsTrigger>
          <TabsTrigger value="activations">{t("reports.tabActivations")}</TabsTrigger>
          <TabsTrigger value="commissions">{t("reports.tabCommissions")}</TabsTrigger>
          <TabsTrigger value="circulation">{t("reports.tabCirculation")}</TabsTrigger>
          <TabsTrigger value="top">{t("reports.tabTop")}</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <SalesReport period={period} />
        </TabsContent>
        <TabsContent value="activations" className="space-y-4">
          <ActivationsReport period={period} />
        </TabsContent>
        <TabsContent value="commissions" className="space-y-4">
          <CommissionsReport period={period} />
        </TabsContent>
        <TabsContent value="circulation" className="space-y-4">
          <CirculationReport />
        </TabsContent>
        <TabsContent value="top" className="space-y-4">
          <TopAffiliatesReport period={period} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** En-tête d'un rapport : son titre, son bouton d'export, et son rappel de lecture. */
function ReportHeader<TRow>({
  title,
  hint,
  rows,
  columns,
  filename,
}: {
  title: string
  hint?: string
  rows: TRow[] | undefined
  columns: CsvColumn<TRow>[]
  filename: string
}) {
  const t = useT()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={!rows || rows.length === 0}
          onClick={() => rows && downloadCsv(csvFilename(filename), rows, columns)}
        >
          <Download />
          {t("common.export")}
        </Button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SalesReport({ period }: { period: ReportPeriod }) {
  const t = useT()
  const query = useQuery(salesReportQueryOptions(period))
  const products = query.data?.products

  return (
    <>
      <ReportHeader
        title={t("reports.tabSales")}
        hint={t("reports.salesHint")}
        rows={products}
        filename="ventes-produits"
        columns={[
          { header: t("reports.salesColumnProduct"), value: (row) => row.productName },
          { header: t("reports.salesColumnCategory"), value: (row) => row.categoryName },
          { header: t("reports.salesColumnQuantity"), value: (row) => row.quantity },
          // Valeur BRUTE : c'est ce qu'un tableur sait relire.
          { header: t("reports.salesColumnTotalDt"), value: (row) => row.totalDt },
          { header: t("reports.salesColumnTotalPoints"), value: (row) => row.totalPoints },
          { header: t("reports.salesColumnOrders"), value: (row) => row.orderCount },
        ]}
      />

      <DataState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={products?.length === 0}
        onRetry={() => void query.refetch()}
        rows={6}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reports.salesColumnProduct")}</TableHead>
                <TableHead className="w-40">
                  {t("reports.salesColumnCategory")}
                </TableHead>
                <TableHead className="w-24 text-end">
                  {t("reports.salesColumnQuantity")}
                </TableHead>
                <TableHead className="w-40 text-end">
                  {t("reports.salesColumnTotalDt")}
                </TableHead>
                <TableHead className="w-32 text-end">
                  {t("reports.salesColumnTotalPoints")}
                </TableHead>
                <TableHead className="w-28 text-end">
                  {t("reports.salesColumnOrders")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell className="font-medium">{row.productName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.categoryName ?? "—"}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.quantity}
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={row.totalDt} />
                  </TableCell>
                  {/* POINTS et DINARS côte à côte, jamais confondus (D-028). */}
                  <TableCell className="text-end">
                    <PointsBv value={row.totalPoints} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.orderCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {products?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("reports.salesEmpty")}</p>
      ) : null}

      {query.data && query.data.byContext.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("reports.byContextTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("orders.column.context")}</TableHead>
                  <TableHead className="w-32 text-end">
                    {t("reports.contextColumnOrders")}
                  </TableHead>
                  <TableHead className="w-40 text-end">
                    {t("reports.contextColumnTotalDt")}
                  </TableHead>
                  <TableHead className="w-40 text-end">
                    {t("reports.contextColumnTotalPoints")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.byContext.map((row) => (
                  <TableRow key={row.context}>
                    <TableCell>{t(`orderContext.${row.context}`)}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {row.orderCount}
                    </TableCell>
                    <TableCell className="text-end">
                      <MoneyDt value={row.totalDt} />
                    </TableCell>
                    <TableCell className="text-end">
                      <PointsBv value={row.totalPoints} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}

function ActivationsReport({ period }: { period: ReportPeriod }) {
  const t = useT()
  const query = useQuery(activationsByPackQueryOptions(period))
  const rows = query.data

  return (
    <>
      <ReportHeader
        title={t("reports.tabActivations")}
        hint={t("reports.activationsHint")}
        rows={rows}
        filename="activations-par-pack"
        columns={[
          { header: t("reports.activationsColumnPack"), value: (row) => row.packName },
          { header: t("reports.activationsColumnTier"), value: (row) => row.tierBv },
          {
            header: t("reports.activationsColumnCount"),
            value: (row) => row.activationCount,
          },
          {
            header: t("reports.activationsColumnCollected"),
            value: (row) => row.collectedDt,
          },
          {
            header: t("reports.activationsColumnPoints"),
            value: (row) => row.injectedPoints,
          },
        ]}
      />

      <DataState
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        rows={4}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reports.activationsColumnPack")}</TableHead>
                <TableHead className="w-32">
                  {t("reports.activationsColumnTier")}
                </TableHead>
                <TableHead className="w-28 text-end">
                  {t("reports.activationsColumnCount")}
                </TableHead>
                <TableHead className="w-40 text-end">
                  {t("reports.activationsColumnCollected")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("reports.activationsColumnPoints")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows?.map((row) => (
                <TableRow key={row.packId}>
                  <TableCell className="font-medium">{row.packName}</TableCell>
                  <TableCell>
                    <PointsBv value={row.tierBv} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.activationCount}
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={row.collectedDt} />
                  </TableCell>
                  <TableCell className="text-end">
                    <PointsBv value={row.injectedPoints} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {rows?.every((row) => row.activationCount === 0) ? (
        <p className="text-sm text-muted-foreground">
          {t("reports.activationsEmpty")}
        </p>
      ) : null}
    </>
  )
}

function CommissionsReport({ period }: { period: ReportPeriod }) {
  const t = useT()
  const query = useQuery(commissionsReportQueryOptions(period))
  const rows = query.data

  return (
    <>
      <ReportHeader
        title={t("reports.tabCommissions")}
        rows={rows}
        filename="commissions-par-periode"
        columns={[
          { header: t("reports.commissionsColumnRun"), value: (row) => row.runId },
          {
            header: t("reports.commissionsColumnPeriod"),
            value: (row) => row.periodEnd,
          },
          {
            header: t("reports.commissionsColumnMembers"),
            value: (row) => row.memberCount,
          },
          { header: t("reports.commissionsColumnGross"), value: (row) => row.grossDt },
          { header: t("reports.commissionsColumnPaid"), value: (row) => row.paidDt },
          { header: t("reports.commissionsColumnLost"), value: (row) => row.lostDt },
          {
            header: t("reports.commissionsColumnRewards"),
            value: (row) => row.rewardPointsGranted,
          },
        ]}
      />

      <DataState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={rows?.length === 0}
        onRetry={() => void query.refetch()}
        rows={6}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">
                  {t("reports.commissionsColumnRun")}
                </TableHead>
                <TableHead>{t("reports.commissionsColumnPeriod")}</TableHead>
                <TableHead className="w-24 text-end">
                  {t("reports.commissionsColumnMembers")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("reports.commissionsColumnGross")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("reports.commissionsColumnPaid")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("reports.commissionsColumnLost")}
                </TableHead>
                <TableHead className="w-28 text-end">
                  {t("reports.commissionsColumnRewards")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows?.map((row) => (
                <TableRow key={row.runId}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to={`/commissions/${row.runId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      #{row.runId}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(row.periodStart)} → {formatDateTime(row.periodEnd)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.memberCount}
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={row.grossDt} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={row.paidDt} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt
                      value={row.lostDt}
                      className={Number(row.lostDt) > 0 ? "text-destructive" : undefined}
                    />
                  </TableCell>
                  <TableCell className="text-end text-xs tabular-nums">
                    {row.rewardPointsGranted}
                    {row.rewardPointsLost > 0 ? (
                      <span className="text-destructive"> (−{row.rewardPointsLost})</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {rows?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("reports.commissionsEmpty")}
        </p>
      ) : null}
    </>
  )
}

function CirculationReport() {
  const t = useT()
  const query = useQuery(circulationQueryOptions)
  const data = query.data

  return (
    <>
      <ReportHeader
        title={t("reports.tabCirculation")}
        hint={t("reports.circulationHint")}
        rows={data ? [data] : undefined}
        filename="dinars-en-circulation"
        columns={[
          { header: t("reports.circulationBalances"), value: (row) => row.memberBalancesDt },
          { header: t("reports.circulationActive"), value: (row) => row.activeEcardsDt },
          { header: t("reports.circulationInSystem"), value: (row) => row.inSystemDt },
          {
            header: t("reports.circulationConsumed"),
            value: (row) => row.consumedEcardsDt,
          },
          {
            header: t("reports.circulationGenesisEcards"),
            value: (row) => row.genesisEcardsDt,
          },
          {
            header: t("reports.circulationGenesisBalance"),
            value: (row) => row.genesisBalanceDt,
          },
          {
            header: t("reports.circulationCommissions"),
            value: (row) => row.commissionsPaidDt,
          },
        ]}
      />

      <DataState
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        rows={4}
      >
        {data ? (
          <Card>
            <CardContent className="space-y-3">
              <Line label={t("reports.circulationBalances")} value={data.memberBalancesDt} />
              <Line label={t("reports.circulationActive")} value={data.activeEcardsDt} />
              <div className="border-t pt-3">
                <Line
                  label={t("reports.circulationInSystem")}
                  value={data.inSystemDt}
                  strong
                />
              </div>
              <div className="space-y-3 border-t pt-3">
                <Line
                  label={t("reports.circulationConsumed")}
                  value={data.consumedEcardsDt}
                />
                <Line
                  label={t("reports.circulationGenesisEcards")}
                  value={data.genesisEcardsDt}
                />
                <Line
                  label={t("reports.circulationGenesisBalance")}
                  value={data.genesisBalanceDt}
                />
                <Line
                  label={t("reports.circulationCommissions")}
                  value={data.commissionsPaidDt}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </DataState>

      <Alert>
        <Info />
        <AlertDescription>{t("reports.circulationHint")}</AlertDescription>
      </Alert>
    </>
  )
}

function TopAffiliatesReport({ period }: { period: ReportPeriod }) {
  const t = useT()
  const query = useQuery(topAffiliatesQueryOptions({ ...period, limit: 20 }))
  const rows = query.data

  return (
    <>
      <ReportHeader
        title={t("reports.tabTop")}
        hint={t("reports.topHint")}
        rows={rows}
        filename="top-affilies"
        columns={[
          { header: t("reports.topColumnMember"), value: (row) => row.memberCode },
          {
            header: t("ledger.column.name"),
            value: (row) => `${row.lastName} ${row.firstName}`,
          },
          { header: t("reports.topColumnPack"), value: (row) => row.packName },
          { header: t("reports.topColumnPaid"), value: (row) => row.paidDt },
          { header: t("reports.topColumnRuns"), value: (row) => row.runCount },
          {
            header: t("reports.topColumnBalances"),
            value: (row) => row.lifetimeBalanceCount,
          },
          { header: t("reports.topColumnRewards"), value: (row) => row.rewardPoints },
        ]}
      />

      <DataState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={rows?.length === 0}
        onRetry={() => void query.refetch()}
        rows={8}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t("reports.topColumnMember")}</TableHead>
                <TableHead>{t("ledger.column.name")}</TableHead>
                <TableHead className="w-28">{t("reports.topColumnPack")}</TableHead>
                <TableHead className="w-40 text-end">
                  {t("reports.topColumnPaid")}
                </TableHead>
                <TableHead className="w-24 text-end">
                  {t("reports.topColumnRuns")}
                </TableHead>
                <TableHead className="w-32 text-end">
                  {t("reports.topColumnBalances")}
                </TableHead>
                <TableHead className="w-32 text-end">
                  {t("reports.topColumnRewards")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows?.map((row) => (
                <TableRow key={row.memberId}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to={`/members/${row.memberId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {row.memberCode}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {row.lastName} {row.firstName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.packName ?? "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={row.paidDt} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{row.runCount}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.lifetimeBalanceCount}
                  </TableCell>
                  {/* Points Fidélité : 3ᵉ unité (D-032), ni dinars ni points d'arbre. */}
                  <TableCell className="text-end tabular-nums">
                    {row.rewardPoints}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {rows?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("reports.topEmpty")}</p>
      ) : null}
    </>
  )
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
        {label}
      </span>
      <MoneyDt value={value} className={strong ? "text-base" : undefined} />
    </div>
  )
}
