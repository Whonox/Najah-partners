import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DataState } from "@/components/common/data-state"
import { PageHeader } from "@/components/common/page-header"
import { OrderContextBadge, ShipmentBadge } from "@/components/common/status-badge"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { myOrdersQueryOptions } from "@/api/queries/shop"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

const PAGE_SIZE = 10

/**
 * MES COMMANDES. Un membre ne voit que les siennes — la route `/orders` filtre sur le token,
 * il n'existe pas de paramètre permettant d'en demander d'autres.
 *
 * Chaque ligne porte le CONTEXTE (activation ou achat libre) : c'est ce qui explique pourquoi
 * deux commandes de même contenu n'ont pas le même montant — une activation se règle au prix
 * du pack moins l'acompte, un achat libre à la somme des prix.
 */
export function OrdersPage() {
  const t = useT()
  const [page, setPage] = useState(1)
  const orders = useQuery(myOrdersQueryOptions({ page, pageSize: PAGE_SIZE }))

  const total = orders.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader title={t("orders.title")} description={t("orders.subtitle")} />

      <DataState
        isLoading={orders.isPending}
        error={orders.error}
        isEmpty={orders.data?.items.length === 0}
        emptyMessage={t("orders.empty")}
        emptyAction={<Button nativeButton={false} render={<Link to="/boutique" />}>{t("nav.shop")}</Button>}
        onRetry={() => void orders.refetch()}
      >
        <ul className="space-y-3">
          {(orders.data?.items ?? []).map((order) => (
            <li key={order.id}>
              <Link to={`/commandes/${order.id}`} className="block">
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {t("orders.number", { id: order.id })}
                        </span>
                        <OrderContextBadge context={order.context} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(order.createdAt)}
                      </p>
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                        <MoneyDt value={order.totalDt} className="font-semibold" />
                        <PointsBv value={order.totalPoints} className="text-muted-foreground" />
                        <ShipmentBadge status={order.shipmentStatus} />
                      </div>
                    </div>
                    <ChevronRight
                      className="size-5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>

        {pages > 1 ? (
          <nav className="flex items-center justify-between gap-3 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              {t("action.previous")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("action.page", { page, pages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              {t("action.next")}
            </Button>
          </nav>
        ) : null}
      </DataState>
    </div>
  )
}
