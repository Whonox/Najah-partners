import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router"
import { X } from "lucide-react"
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
  ORDER_CONTEXTS,
  SHIPMENT_STATUSES,
  type OrderContext,
  type ShipmentStatus,
} from "@/api/enums"
import { ordersQueryOptions, type OrdersQuery } from "@/api/queries/orders"
import { DataState } from "@/components/common/data-state"
import {
  FilterBar,
  FilterField,
  Pagination,
  TableShell,
} from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import {
  OrderContextBadge,
  ShipmentBadge,
} from "@/components/common/status-badge"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

const PAGE_SIZE = 20
const ANY = "__any__"

/**
 * Commandes (spec §7.2.6).
 *
 * La table affiche les DEUX totaux côte à côte sans jamais suggérer qu'ils se déduisent l'un
 * de l'autre (D-028) : en ACTIVATION, le total en points vaut le palier du pack tandis que le
 * total en dinars vaut le prix du pack MOINS l'acompte d'inscription — deux nombres qui n'ont
 * aucun rapport arithmétique.
 *
 * AUCUNE ANNULATION n'est proposée, et il n'existe aucune route pour en faire une : les
 * e-cards qui ont réglé la commande sont brûlées, et `USED` est irréversible. Que deviendrait
 * leur valeur ? La question n'est pas tranchée — on ne construit donc pas le chemin.
 */
export function OrdersPage() {
  const t = useT()
  const [searchParams, setSearchParams] = useSearchParams()

  // `?memberId=` : la fiche membre renvoie ici. Le filtre est pré-rempli, et modifiable.
  const [memberId, setMemberId] = useState(searchParams.get("memberId") ?? "")
  const [context, setContext] = useState<OrderContext | undefined>()
  const [shipment, setShipment] = useState<ShipmentStatus | undefined>()
  const [page, setPage] = useState(1)

  const query = useMemo<OrdersQuery>(() => {
    const parsedMember = Number(memberId)
    return {
      page,
      pageSize: PAGE_SIZE,
      ...(Number.isInteger(parsedMember) && parsedMember > 0
        ? { memberId: parsedMember }
        : {}),
      ...(context ? { context } : {}),
      ...(shipment ? { shipmentStatus: shipment } : {}),
    }
  }, [page, memberId, context, shipment])

  const orders = useQuery(ordersQueryOptions(query))

  function filter<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  const hasFilters = memberId !== "" || !!context || !!shipment

  return (
    <div className="space-y-6">
      <PageHeader title={t("orders.title")} description={t("orders.description")} />

      <FilterBar>
        <FilterField label={t("orders.filter.member")} htmlFor="orders-member">
          <Input
            id="orders-member"
            inputMode="numeric"
            className="w-32 tabular-nums"
            value={memberId}
            onChange={(event) => filter(setMemberId)(event.target.value)}
          />
        </FilterField>

        <FilterField label={t("orders.filter.context")} className="w-40">
          <Select
            value={context ?? ANY}
            onValueChange={(value) =>
              filter(setContext)(value === ANY ? undefined : (value as OrderContext))
            }
          >
            <SelectTrigger aria-label={t("orders.filter.context")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("common.all")}</SelectItem>
              {ORDER_CONTEXTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`orderContext.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label={t("orders.filter.shipment")} className="w-44">
          <Select
            value={shipment ?? ANY}
            onValueChange={(value) =>
              filter(setShipment)(
                value === ANY ? undefined : (value as ShipmentStatus),
              )
            }
          >
            <SelectTrigger aria-label={t("orders.filter.shipment")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("common.all")}</SelectItem>
              {SHIPMENT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`shipment.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMemberId("")
              setContext(undefined)
              setShipment(undefined)
              setPage(1)
              setSearchParams({}, { replace: true })
            }}
          >
            <X />
            {t("common.reset")}
          </Button>
        ) : null}
      </FilterBar>

      <DataState
        isLoading={orders.isPending}
        error={orders.error}
        isEmpty={orders.data?.items.length === 0}
        onRetry={() => void orders.refetch()}
        rows={10}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t("orders.column.id")}</TableHead>
                <TableHead className="w-24">
                  {t("orders.column.member")}
                </TableHead>
                <TableHead className="w-28">
                  {t("orders.column.context")}
                </TableHead>
                {/* DINARS payés… */}
                <TableHead className="w-36 text-end">
                  {t("orders.column.totalDt")}
                </TableHead>
                {/* …et POINTS du panier : deux colonnes, deux unités, aucun lien entre elles. */}
                <TableHead className="w-28">
                  {t("orders.column.totalPoints")}
                </TableHead>
                <TableHead className="w-24">
                  {t("orders.column.status")}
                </TableHead>
                <TableHead className="w-24">
                  {t("orders.column.ecards")}
                </TableHead>
                <TableHead className="w-32">
                  {t("orders.column.shipment")}
                </TableHead>
                <TableHead className="w-36">{t("orders.column.date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.data?.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      to={`/orders/${order.id}`}
                      className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                    >
                      #{order.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/members/${order.memberId}`}
                      className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                    >
                      #{order.memberId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <OrderContextBadge context={order.context} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={order.totalDt} />
                  </TableCell>
                  <TableCell>
                    <PointsBv value={order.totalPoints} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`orderStatus.${order.status}`)}
                  </TableCell>
                  <TableCell
                    className="tabular-nums text-muted-foreground"
                    title={t("orders.ecardHint")}
                  >
                    {order.ecardIds.length}
                  </TableCell>
                  <TableCell>
                    <ShipmentBadge status={order.shipmentStatus ?? null} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {orders.data ? (
        <Pagination
          page={orders.data.page}
          pageSize={orders.data.pageSize}
          total={orders.data.total}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  )
}
