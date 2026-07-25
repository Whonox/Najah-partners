import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { EyeOff, Search, Sparkles, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import {
  ECARD_ORIGINS,
  ECARD_STATUSES,
  type EcardOrigin,
  type EcardStatus,
} from "@/api/enums"
import {
  ecardsQueryOptions,
  type EcardAdminRow,
  type EcardSortField,
  type EcardsQuery,
} from "@/api/queries/ecards"
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
import { MoneyDt } from "@/components/format/amount"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { GenesisEcardDialog } from "./ecard-dialogs"

const PAGE_SIZE = 20
const ANY = "__any__"

/**
 * E-cards (spec §7.2.9).
 *
 * ═══ AUCUN CODE N'EST AFFICHÉ, ET CE N'EST PAS UNE CONSIGNE MAIS UN TYPE ═══
 * `EcardAdminRow` vient d'un DTO backend sans champ `code` : écrire `ecard.code` ici ne
 * compilerait pas. La table désigne donc les cartes par leur identifiant. La recherche PAR code
 * fonctionne (l'admin le saisit, la correspondance est exacte), mais la réponse ne le contient
 * pas — chercher n'est pas restituer.
 *
 * Un code d'e-card est de l'argent au porteur : le connaître suffit à le dépenser. Le masquer
 * à l'affichage n'aurait rien protégé — il aurait circulé dans la réponse HTTP, le cache du
 * navigateur et les journaux du proxy.
 */
export function EcardsPage() {
  const t = useT()
  const { hasRole } = useAuth()
  const canGenesis = hasRole(["SUPER_ADMIN"])
  const canAct = hasRole(["SUPER_ADMIN", "MANAGER"])

  const [code, setCode] = useState("")
  const [status, setStatus] = useState<EcardStatus | undefined>()
  const [origin, setOrigin] = useState<EcardOrigin | undefined>()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [sort, setSort] = useState<EcardSortField>("createdAt")
  const [direction, setDirection] = useState<SortDirection>("desc")
  const [page, setPage] = useState(1)
  const [genesisOpen, setGenesisOpen] = useState(false)

  const query = useMemo<EcardsQuery>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(code.trim() ? { code: code.trim() } : {}),
      ...(status ? { status } : {}),
      ...(origin ? { origin } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      sort,
      direction,
    }),
    [page, code, status, origin, from, to, sort, direction],
  )

  const ecards = useQuery(ecardsQueryOptions(query))

  const statusOptions: SelectOption[] = [
    { value: ANY, label: t("ecards.filterStatusAll") },
    ...ECARD_STATUSES.map((value) => ({
      value,
      label: t(`ecardStatus.${value}`),
    })),
  ]
  const originOptions: SelectOption[] = [
    { value: ANY, label: t("ecards.filterOriginAll") },
    ...ECARD_ORIGINS.map((value) => ({
      value,
      label: t(`ecardOrigin.${value}`),
    })),
  ]
  const hasFilters =
    code !== "" || !!status || !!origin || from !== "" || to !== ""

  function toggleSort(field: EcardSortField) {
    if (sort === field) {
      setDirection(direction === "asc" ? "desc" : "asc")
    } else {
      setSort(field)
      setDirection("desc")
    }
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("ecards.title")}
        description={t("ecards.description")}
        actions={
          canGenesis ? (
            <Button onClick={() => setGenesisOpen(true)}>
              <Sparkles />
              {t("ecards.genesisAction")}
            </Button>
          ) : null
        }
      />

      <Alert>
        <EyeOff />
        <AlertDescription>{t("ecards.neverShowCode")}</AlertDescription>
      </Alert>

      <FilterBar>
        <FilterField
          label={t("ecards.searchCode")}
          htmlFor="ecards-code"
          className="min-w-56 flex-1"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="ecards-code"
              value={code}
              placeholder={t("ecards.searchCodePlaceholder")}
              className="ps-8 font-mono"
              autoComplete="off"
              onChange={(event) => {
                setCode(event.target.value)
                setPage(1)
              }}
            />
          </div>
        </FilterField>

        <FilterField label={t("ecards.filterStatus")} className="w-40">
          <Select
            options={statusOptions}
            value={status ?? ANY}
            onValueChange={(value) => {
              setStatus(value === ANY ? undefined : (value as EcardStatus))
              setPage(1)
            }}
          >
            <SelectTrigger aria-label={t("ecards.filterStatus")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptions options={statusOptions} />
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t("ecards.filterOrigin")} className="w-40">
          <Select
            options={originOptions}
            value={origin ?? ANY}
            onValueChange={(value) => {
              setOrigin(value === ANY ? undefined : (value as EcardOrigin))
              setPage(1)
            }}
          >
            <SelectTrigger aria-label={t("ecards.filterOrigin")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectOptions options={originOptions} />
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t("common.from")} htmlFor="ecards-from">
          <Input
            id="ecards-from"
            type="date"
            value={from}
            className="w-40"
            onChange={(event) => {
              setFrom(event.target.value)
              setPage(1)
            }}
          />
        </FilterField>

        <FilterField label={t("common.to")} htmlFor="ecards-to">
          <Input
            id="ecards-to"
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
              setCode("")
              setStatus(undefined)
              setOrigin(undefined)
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

      {ecards.data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
          <span className="text-sm text-muted-foreground">
            {t("ecards.totalValue")}
          </span>
          <MoneyDt value={ecards.data.totalValueDt} className="text-base" />
        </div>
      ) : null}

      {!canAct ? (
        <p className="text-xs text-muted-foreground">
          {t("ecards.actionsRestricted")}
        </p>
      ) : null}

      <DataState
        isLoading={ecards.isPending}
        error={ecards.error}
        isEmpty={ecards.data?.items.length === 0}
        onRetry={() => void ecards.refetch()}
        rows={10}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t("ecards.column.id")}</TableHead>
                <SortableHead
                  field="valueDt"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                  className="w-36 text-end"
                >
                  {t("ecards.column.value")}
                </SortableHead>
                <TableHead className="w-28">{t("ecards.column.status")}</TableHead>
                <TableHead className="w-24">{t("ecards.column.origin")}</TableHead>
                <TableHead className="w-32">{t("ecards.column.creator")}</TableHead>
                <TableHead className="w-32">{t("ecards.column.user")}</TableHead>
                <SortableHead
                  field="createdAt"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                  className="w-36"
                >
                  {t("ecards.column.createdAt")}
                </SortableHead>
                <SortableHead
                  field="expiresAt"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                  className="w-36"
                >
                  {t("ecards.column.expiresAt")}
                </SortableHead>
                <TableHead className="w-32">{t("ecards.column.paid")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ecards.data?.items.map((ecard) => (
                <EcardRow key={ecard.id} ecard={ecard} />
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {/* État vide DISTINCT selon la cause : « ce code n'existe pas » n'est pas « aucune carte ». */}
      {ecards.data?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {code.trim() ? t("ecards.emptySearch") : t("ecards.empty")}
        </p>
      ) : null}

      {ecards.data ? (
        <Pagination
          page={ecards.data.page}
          pageSize={ecards.data.pageSize}
          total={ecards.data.total}
          onPageChange={setPage}
        />
      ) : null}

      {genesisOpen ? (
        <GenesisEcardDialog onClose={() => setGenesisOpen(false)} />
      ) : null}
    </div>
  )
}

function EcardRow({ ecard }: { ecard: EcardAdminRow }) {
  const t = useT()

  return (
    <TableRow>
      {/* L'identifiant est le SEUL désignateur affichable d'une e-card. */}
      <TableCell className="font-mono text-xs">
        <Link
          to={`/ecards/${ecard.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          #{ecard.id}
        </Link>
      </TableCell>
      <TableCell className="text-end">
        <MoneyDt value={ecard.valueDt} />
      </TableCell>
      <TableCell>
        <EcardStatusBadge status={ecard.status} />
      </TableCell>
      <TableCell>
        <EcardOriginBadge origin={ecard.origin} />
      </TableCell>
      <TableCell className="font-mono text-xs">
        {ecard.creatorMemberId !== null ? (
          <Link
            to={`/members/${ecard.creatorMemberId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {ecard.creatorMemberCode}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {ecard.userMemberId !== null ? (
          <Link
            to={`/members/${ecard.userMemberId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {ecard.userMemberCode}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDateTime(ecard.createdAt)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {ecard.expiresAt ? formatDateTime(ecard.expiresAt) : t("ecards.unlimited")}
      </TableCell>
      <TableCell className="text-xs">
        <PaidTarget ecard={ecard} />
      </TableCell>
    </TableRow>
  )
}

/** Ce que la carte a payé : une commande OU une adhésion, jamais les deux (D-041). */
function PaidTarget({ ecard }: { ecard: EcardAdminRow }) {
  const t = useT()

  if (ecard.orderId !== null) {
    return (
      <Link
        to={`/orders/${ecard.orderId}`}
        className="text-primary underline-offset-4 hover:underline"
      >
        {t("ecards.paidOrder")} #{ecard.orderId}
      </Link>
    )
  }
  if (ecard.membershipPaymentId !== null) {
    return (
      <span>
        {t("ecards.paidMembership")}
        {ecard.membershipPaymentType
          ? ` (${ecard.membershipPaymentType === "REGISTRATION" ? "inscription" : "renouvellement"})`
          : ""}
      </span>
    )
  }
  return <span className="text-muted-foreground">{t("ecards.paidNothing")}</span>
}

/**
 * Statut d'une e-card. `ACTIVE` est le seul état « vivant » (de la valeur en circulation) :
 * c'est lui qu'on met en avant. `USED` est définitif et normal — pas une alerte.
 */
export function EcardStatusBadge({ status }: { status: EcardStatus }) {
  const t = useT()
  const variant =
    status === "ACTIVE"
      ? "default"
      : status === "USED"
        ? "secondary"
        : status === "REVOKED"
          ? "destructive"
          : "outline"

  return <Badge variant={variant}>{t(`ecardStatus.${status}`)}</Badge>
}

/** GENESIS mérite d'être visible : c'est de la valeur créée sans contrepartie. */
export function EcardOriginBadge({ origin }: { origin: EcardOrigin }) {
  const t = useT()
  return (
    <Badge variant={origin === "GENESIS" ? "destructive" : "outline"}>
      {t(`ecardOrigin.${origin}`)}
    </Badge>
  )
}
