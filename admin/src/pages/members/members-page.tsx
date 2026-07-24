import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  MEMBER_STATUSES,
  VERIFICATION_STATUSES,
  type MemberStatus,
  type VerificationStatus,
} from "@/api/enums"
import {
  membersQueryOptions,
  type MemberListItem,
  type MemberRef,
  type MembersQuery,
  type MemberSortField,
} from "@/api/queries/members"
import { packsQueryOptions } from "@/api/queries/packs"
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
import {
  MemberStatusBadge,
  VerificationBadge,
} from "@/components/common/status-badge"
import { MoneyDt } from "@/components/format/amount"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

const PAGE_SIZE = 20
/** Valeur des listes déroulantes pour « pas de filtre » : un `<Select>` ne rend pas `undefined`. */
const ANY = "__any__"

/**
 * Liste des membres (spec §7.2.2).
 *
 * Tout le travail — recherche, filtres, tri, pagination — est fait par le BACKEND : trier ou
 * filtrer les 20 lignes reçues donnerait un résultat faux dès qu'il y a une 21ᵉ. L'écran ne
 * fait que composer la requête et afficher la réponse.
 *
 * Les deux dimensions sont visuellement séparées (D-028) : le solde passe par `MoneyDt`
 * (3 décimales, aligné à droite, unité DT), et aucune colonne de cette table ne mélange un
 * point avec un dinar.
 *
 * Aucune action d'écriture ici, et ce n'est pas un oubli : le placement est immuable,
 * l'activation passe par la boutique, l'ajustement de solde vit dans le module Soldes.
 */
export function MembersPage() {
  const t = useT()

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<MemberStatus | undefined>()
  const [verification, setVerification] = useState<VerificationStatus | undefined>()
  const [packId, setPackId] = useState<number | undefined>()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [sort, setSort] = useState<MemberSortField>("id")
  const [direction, setDirection] = useState<SortDirection>("desc")
  const [page, setPage] = useState(1)

  const packs = useQuery(packsQueryOptions)

  const query = useMemo<MembersQuery>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(status ? { status } : {}),
      ...(verification ? { verificationStatus: verification } : {}),
      ...(packId ? { packId } : {}),
      ...(from ? { registeredFrom: from } : {}),
      ...(to ? { registeredTo: to } : {}),
      sort,
      direction,
    }),
    [page, search, status, verification, packId, from, to, sort, direction],
  )

  const members = useQuery(membersQueryOptions(query))

  /**
   * Changer un filtre ramène TOUJOURS à la page 1 : rester en page 4 après avoir restreint
   * la liste à deux résultats afficherait une table vide, que l'admin lirait comme « aucun
   * membre » alors que le filtre en trouve deux.
   */
  function filter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  function toggleSort(field: MemberSortField) {
    if (sort === field) {
      setDirection(direction === "asc" ? "desc" : "asc")
    } else {
      setSort(field)
      setDirection("asc")
    }
    setPage(1)
  }

  const hasFilters =
    search !== "" || !!status || !!verification || !!packId || from !== "" || to !== ""

  function resetFilters() {
    setSearch("")
    setStatus(undefined)
    setVerification(undefined)
    setPackId(undefined)
    setFrom("")
    setTo("")
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("members.title")} description={t("members.description")} />

      <FilterBar>
        <FilterField
          label={t("common.search")}
          htmlFor="members-search"
          className="min-w-56 flex-1"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="members-search"
              value={search}
              placeholder={t("common.searchPlaceholder")}
              className="ps-8"
              onChange={(event) => filter(setSearch)(event.target.value)}
            />
          </div>
        </FilterField>

        <FilterField label={t("members.filter.status")} className="w-40">
          <Select
            value={status ?? ANY}
            onValueChange={(value) =>
              filter(setStatus)(value === ANY ? undefined : (value as MemberStatus))
            }
          >
            <SelectTrigger aria-label={t("members.filter.status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("common.all")}</SelectItem>
              {MEMBER_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`memberStatus.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t("members.filter.pack")} className="w-40">
          <Select
            value={packId ? String(packId) : ANY}
            onValueChange={(value) =>
              filter(setPackId)(value === ANY ? undefined : Number(value))
            }
          >
            <SelectTrigger aria-label={t("members.filter.pack")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("common.all")}</SelectItem>
              {(packs.data ?? []).map((pack) => (
                <SelectItem key={pack.id} value={String(pack.id)}>
                  {pack.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t("members.filter.verification")} className="w-40">
          <Select
            value={verification ?? ANY}
            onValueChange={(value) =>
              filter(setVerification)(
                value === ANY ? undefined : (value as VerificationStatus),
              )
            }
          >
            <SelectTrigger aria-label={t("members.filter.verification")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("common.all")}</SelectItem>
              {VERIFICATION_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`verification.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t("members.filter.from")} htmlFor="members-from">
          <Input
            id="members-from"
            type="date"
            value={from}
            className="w-40"
            onChange={(event) => filter(setFrom)(event.target.value)}
          />
        </FilterField>

        <FilterField label={t("members.filter.to")} htmlFor="members-to">
          <Input
            id="members-to"
            type="date"
            value={to}
            className="w-40"
            onChange={(event) => filter(setTo)(event.target.value)}
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
        isLoading={members.isPending}
        error={members.error}
        isEmpty={members.data?.items.length === 0}
        onRetry={() => void members.refetch()}
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
                  {t("members.column.code")}
                </SortableHead>
                <SortableHead
                  field="lastName"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                >
                  {t("members.column.name")}
                </SortableHead>
                <SortableHead
                  field="status"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                  className="w-24"
                >
                  {t("members.column.status")}
                </SortableHead>
                <TableHead className="w-24">{t("members.column.pack")}</TableHead>
                <SortableHead
                  field="balanceDt"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                  className="w-36 text-end"
                >
                  {t("members.column.balance")}
                </SortableHead>
                <TableHead className="w-32">
                  {t("members.column.downlines")}
                </TableHead>
                <SortableHead
                  field="registeredAt"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                  className="w-32"
                >
                  {t("members.column.registeredAt")}
                </SortableHead>
                <SortableHead
                  field="activatedAt"
                  active={sort}
                  direction={direction}
                  onSort={toggleSort}
                  className="w-32"
                >
                  {t("members.column.activatedAt")}
                </SortableHead>
                <TableHead className="w-28">
                  {t("members.column.verification")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data?.items.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {members.data ? (
        <Pagination
          page={members.data.page}
          pageSize={members.data.pageSize}
          total={members.data.total}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  )
}

function MemberRow({ member }: { member: MemberListItem }) {
  const t = useT()

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Link
          to={`/members/${member.id}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {member.memberCode}
        </Link>
      </TableCell>
      <TableCell className="font-medium">
        {member.lastName} {member.firstName}
      </TableCell>
      <TableCell>
        <MemberStatusBadge status={member.status} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {member.packName ?? t("common.none")}
      </TableCell>
      {/* Colonne d'ARGENT : alignée à droite, 3 décimales. Jamais un point ici. */}
      <TableCell className="text-end">
        <MoneyDt value={member.balanceDt} />
      </TableCell>
      <TableCell className="text-xs">
        <DownlineCell downline={member.leftDownline} side={t("members.legLeft")} />
        {" · "}
        <DownlineCell downline={member.rightDownline} side={t("members.legRight")} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDateTime(member.registeredAt)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {member.activatedAt ? formatDateTime(member.activatedAt) : t("common.none")}
      </TableCell>
      <TableCell>
        <VerificationBadge status={member.verificationStatus} />
      </TableCell>
    </TableRow>
  )
}

/** Une jambe : le code du downline s'il existe, sinon « libre » — jamais une case vide ambiguë. */
function DownlineCell({
  downline,
  side,
}: {
  downline: MemberRef | null | undefined
  side: string
}) {
  const t = useT()

  return (
    <span>
      <span className="text-muted-foreground">{side} </span>
      {downline ? (
        <Link
          to={`/members/${downline.id}`}
          className="font-mono text-primary underline-offset-4 hover:underline"
        >
          {downline.memberCode}
        </Link>
      ) : (
        <span className="text-muted-foreground italic">
          {t("members.legFree")}
        </span>
      )}
    </span>
  )
}
