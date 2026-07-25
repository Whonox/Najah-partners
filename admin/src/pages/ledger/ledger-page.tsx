import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Info, Search, Sparkles, SlidersHorizontal, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  LEDGER_MOVEMENT_TYPES,
  MEMBER_STATUSES,
  type LedgerMovementType,
  type MemberStatus,
} from "@/api/enums"
import {
  balancesQueryOptions,
  movementsQueryOptions,
  type BalanceRow,
  type BalanceSortField,
  type BalancesQuery,
  type MovementRow,
  type MovementsQuery,
} from "@/api/queries/ledger"
import { DataState } from "@/components/common/data-state"
import {
  FilterBar,
  FilterField,
  Pagination,
  SortableHead,
  TableShell,
  type SortDirection,
} from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import { MemberStatusBadge } from "@/components/common/status-badge"
import { MoneyDt } from "@/components/format/amount"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { BalanceWriteDialog } from "./balance-write-dialog"

const PAGE_SIZE = 20
const ANY = "__any__"

/**
 * Soldes & mouvements (spec §7.2.8) — deux vues du MÊME grand livre :
 *  — le **registre** répond à « où est l'argent ? » (tous les soldes, avec leur somme) ;
 *  — le **journal** répond à « qu'est-ce qui a bougé ? » (chaque mouvement, signé, avec sa source).
 *
 * Le rappel D-025 est permanent et pas décoratif : consommer une e-card n'écrit RIEN ici. Sans
 * cette phrase, un admin qui cherche la trace d'une activation payée par e-card conclurait à un
 * bug du grand livre — alors que c'est le modèle même de l'e-card (elle paie, elle ne recharge pas).
 */
export function LedgerPage() {
  const t = useT()
  const { hasRole } = useAuth()
  const canAdjust = hasRole(["SUPER_ADMIN", "MANAGER"])
  const canGenesis = hasRole(["SUPER_ADMIN"])

  /** Le membre sur lequel porteront l'ajustement et la genèse : choisi dans le registre. */
  const [selected, setSelected] = useState<BalanceRow | null>(null)
  const [writeMode, setWriteMode] = useState<"adjust" | "genesis" | null>(null)

  return (
    <div className="space-y-6">
      <PageHeader title={t("ledger.title")} description={t("ledger.description")} />

      <Alert>
        <Info />
        <AlertDescription>{t("ledger.noEcardUse")}</AlertDescription>
      </Alert>

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">{t("ledger.tabBalances")}</TabsTrigger>
          <TabsTrigger value="movements">{t("ledger.tabMovements")}</TabsTrigger>
        </TabsList>

        <TabsContent value="balances" className="space-y-4">
          <BalancesTab
            canAdjust={canAdjust}
            canGenesis={canGenesis}
            selected={selected}
            onSelect={setSelected}
            onWrite={setWriteMode}
          />
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <MovementsTab />
        </TabsContent>
      </Tabs>

      {writeMode && selected ? (
        <BalanceWriteDialog
          mode={writeMode}
          member={selected}
          onClose={() => setWriteMode(null)}
        />
      ) : null}
    </div>
  )
}

function BalancesTab({
  canAdjust,
  canGenesis,
  selected,
  onSelect,
  onWrite,
}: {
  canAdjust: boolean
  canGenesis: boolean
  selected: BalanceRow | null
  onSelect: (row: BalanceRow | null) => void
  onWrite: (mode: "adjust" | "genesis") => void
}) {
  const t = useT()

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<MemberStatus | undefined>()
  const [withBalanceOnly, setWithBalanceOnly] = useState(false)
  const [sort, setSort] = useState<BalanceSortField>("balanceDt")
  const [direction, setDirection] = useState<SortDirection>("desc")
  const [page, setPage] = useState(1)

  const query = useMemo<BalancesQuery>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(status ? { status } : {}),
      ...(withBalanceOnly ? { withBalanceOnly: true } : {}),
      sort,
      direction,
    }),
    [page, search, status, withBalanceOnly, sort, direction],
  )

  const balances = useQuery(balancesQueryOptions(query))

  const statusOptions: SelectOption[] = [
    { value: ANY, label: t("ledger.filterStatusAll") },
    ...MEMBER_STATUSES.map((value) => ({
      value,
      label: t(`memberStatus.${value}`),
    })),
  ]
  const hasFilters = search !== "" || !!status || withBalanceOnly

  function toggleSort(field: BalanceSortField) {
    if (sort === field) {
      setDirection(direction === "asc" ? "desc" : "asc")
    } else {
      setSort(field)
      setDirection("asc")
    }
    setPage(1)
  }

  return (
    <>
      <FilterBar>
        <FilterField
          label={t("common.search")}
          htmlFor="balances-search"
          className="min-w-56 flex-1"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="balances-search"
              value={search}
              placeholder={t("ledger.searchPlaceholder")}
              className="ps-8"
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
        </FilterField>

        <FilterField label={t("ledger.filterStatus")} className="w-40">
          <Select
            options={statusOptions}
            value={status ?? ANY}
            onValueChange={(value) => {
              setStatus(value === ANY ? undefined : (value as MemberStatus))
              setPage(1)
            }}
          >
            <SelectTrigger aria-label={t("ledger.filterStatus")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptions options={statusOptions} />
            </SelectContent>
          </Select>
        </FilterField>

        <div className="flex items-center gap-2 pb-1">
          <Checkbox
            id="balances-nonzero"
            checked={withBalanceOnly}
            onCheckedChange={(checked) => {
              setWithBalanceOnly(checked === true)
              setPage(1)
            }}
          />
          <Label htmlFor="balances-nonzero" className="text-xs font-normal">
            {t("ledger.withBalanceOnly")}
          </Label>
        </div>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("")
              setStatus(undefined)
              setWithBalanceOnly(false)
              setPage(1)
            }}
          >
            <X />
            {t("common.reset")}
          </Button>
        ) : null}
      </FilterBar>

      {/* Le total porte sur TOUT le filtre, pas sur la page : « combien détiennent les gelés ? »
          est précisément la question qu'on pose à un registre. */}
      {balances.data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <span className="text-sm text-muted-foreground">
            {t("ledger.totalBalances")}
          </span>
          <MoneyDt value={balances.data.totalBalanceDt} className="text-base" />
        </div>
      ) : null}

      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="text-sm">
            <span className="text-muted-foreground">{t("ledger.selectedMember")} : </span>
            <span className="font-mono text-xs">{selected.memberCode}</span>{" "}
            <span className="font-medium">
              {selected.lastName} {selected.firstName}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canAdjust ? (
              <Button variant="outline" size="sm" onClick={() => onWrite("adjust")}>
                <SlidersHorizontal />
                {t("ledger.adjust")}
              </Button>
            ) : null}
            {canGenesis ? (
              <Button variant="outline" size="sm" onClick={() => onWrite("genesis")}>
                <Sparkles />
                {t("ledger.genesis")}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
              <X />
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("ledger.memberRequired")}</p>
      )}

      {!canAdjust ? (
        <p className="text-xs text-muted-foreground">{t("ledger.adjustRestricted")}</p>
      ) : null}
      {!canGenesis ? (
        <p className="text-xs text-muted-foreground">{t("ledger.genesisRestricted")}</p>
      ) : null}

      <DataState
        isLoading={balances.isPending}
        error={balances.error}
        isEmpty={balances.data?.items.length === 0}
        onRetry={() => void balances.refetch()}
        rows={10}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  field="memberCode"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                  className="w-28"
                >
                  {t("ledger.column.code")}
                </SortableHead>
                <SortableHead
                  field="lastName"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                >
                  {t("ledger.column.name")}
                </SortableHead>
                <TableHead className="w-24">{t("ledger.column.status")}</TableHead>
                <SortableHead
                  field="balanceDt"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                  className="w-40 text-end"
                >
                  {t("ledger.column.balance")}
                </SortableHead>
                <TableHead className="w-24 text-end">
                  {t("ledger.column.movements")}
                </TableHead>
                <TableHead className="w-40">
                  {t("ledger.column.lastMovement")}
                </TableHead>
                <TableHead className="w-28">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.data?.items.map((row) => (
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
                  <TableCell>
                    <MemberStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={row.balanceDt} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {row.movementCount}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.lastMovementAt ? formatDateTime(row.lastMovementAt) : "—"}
                  </TableCell>
                  <TableCell>
                    {canAdjust || canGenesis ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelect(row)}
                        aria-label={`${t("ledger.selectedMember")} ${row.memberCode}`}
                      >
                        {t("common.details")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {balances.data?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ledger.emptyBalances")}</p>
      ) : null}

      {balances.data ? (
        <Pagination
          page={balances.data.page}
          pageSize={balances.data.pageSize}
          total={balances.data.total}
          onPageChange={setPage}
        />
      ) : null}
    </>
  )
}

function MovementsTab() {
  const t = useT()

  const [search, setSearch] = useState("")
  const [type, setType] = useState<LedgerMovementType | undefined>()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)

  const query = useMemo<MovementsQuery>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(type ? { type } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [page, search, type, from, to],
  )

  const movements = useQuery(movementsQueryOptions(query))

  const typeOptions: SelectOption[] = [
    { value: ANY, label: t("ledger.filterTypeAll") },
    ...LEDGER_MOVEMENT_TYPES.map((value) => ({
      value,
      label: t(`movementType.${value}`),
    })),
  ]
  const hasFilters = search !== "" || !!type || from !== "" || to !== ""

  return (
    <>
      <FilterBar>
        <FilterField
          label={t("common.search")}
          htmlFor="movements-search"
          className="min-w-56 flex-1"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="movements-search"
              value={search}
              placeholder={t("ledger.searchPlaceholder")}
              className="ps-8"
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
        </FilterField>

        <FilterField label={t("ledger.filterType")} className="w-48">
          <Select
            options={typeOptions}
            value={type ?? ANY}
            onValueChange={(value) => {
              setType(value === ANY ? undefined : (value as LedgerMovementType))
              setPage(1)
            }}
          >
            <SelectTrigger aria-label={t("ledger.filterType")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptions options={typeOptions} />
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t("common.from")} htmlFor="movements-from">
          <Input
            id="movements-from"
            type="date"
            value={from}
            className="w-40"
            onChange={(event) => {
              setFrom(event.target.value)
              setPage(1)
            }}
          />
        </FilterField>

        <FilterField label={t("common.to")} htmlFor="movements-to">
          <Input
            id="movements-to"
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("")
              setType(undefined)
              setFrom("")
              setTo("")
              setPage(1)
            }}
          >
            <X />
            {t("common.reset")}
          </Button>
        ) : null}
      </FilterBar>

      {movements.data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <span className="text-sm text-muted-foreground">{t("ledger.netAmount")}</span>
          <MoneyDt value={movements.data.netAmountDt} className="text-base" />
        </div>
      ) : null}

      <DataState
        isLoading={movements.isPending}
        error={movements.error}
        isEmpty={movements.data?.items.length === 0}
        onRetry={() => void movements.refetch()}
        rows={10}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{t("common.date")}</TableHead>
                <TableHead className="w-28">{t("ledger.column.code")}</TableHead>
                <TableHead>{t("ledger.column.name")}</TableHead>
                <TableHead className="w-44">{t("ledger.column.type")}</TableHead>
                <TableHead className="w-36 text-end">
                  {t("ledger.column.amount")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("ledger.column.balanceAfter")}
                </TableHead>
                <TableHead className="w-32">{t("ledger.column.source")}</TableHead>
                <TableHead>{t("ledger.column.reason")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.data?.items.map((row) => (
                <MovementTableRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {movements.data?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ledger.emptyMovements")}</p>
      ) : null}

      {movements.data ? (
        <Pagination
          page={movements.data.page}
          pageSize={movements.data.pageSize}
          total={movements.data.total}
          onPageChange={setPage}
        />
      ) : null}
    </>
  )
}

function MovementTableRow({ row }: { row: MovementRow }) {
  const t = useT()
  // Le SIGNE est déjà porté par le montant (« -100,000 ») : on ne le répète pas en couleur sur
  // toute la colonne, sinon la moitié du journal serait rouge en permanence.
  const credit = !String(row.amountDt).startsWith("-")

  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground">
        {formatDateTime(row.createdAt)}
      </TableCell>
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
      <TableCell className="text-sm">{t(`movementType.${row.type}`)}</TableCell>
      <TableCell className="text-end">
        <MoneyDt value={row.amountDt} className={credit ? undefined : "text-destructive"} />
      </TableCell>
      <TableCell className="text-end">
        <MoneyDt value={row.balanceAfterDt} className="text-muted-foreground" />
      </TableCell>
      <TableCell className="text-xs">
        {row.ecardId !== null ? (
          <Link
            to={`/ecards/${row.ecardId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {t("ledger.sourceEcard")} #{row.ecardId}
          </Link>
        ) : row.commissionId !== null ? (
          <span className="text-muted-foreground">
            {t("ledger.sourceCommission")} #{row.commissionId}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
        {row.reason ?? "—"}
      </TableCell>
    </TableRow>
  )
}
