import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataState } from "@/components/common/data-state"
import { PageHeader } from "@/components/common/page-header"
import { Pager } from "@/components/common/pager"
import { Surface } from "@/components/common/surface"
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
                <Surface
                  variant="card"
                  className="flex items-center gap-3 transition-colors hover:bg-muted"
                >
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
                    {/* Les deux dimensions de la commande (D-028) : ce qu'elle a COÛTÉ en
                        dinars, ce qu'elle valait en points. Un achat libre affiche des points
                        qui ne sont jamais montés dans l'arbre — le badge de contexte, juste
                        au-dessus, est ce qui permet de le savoir. */}
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
                </Surface>
              </Link>
            </li>
          ))}
        </ul>

        <Pager page={page} pages={pages} onChange={setPage} />
      </DataState>
    </div>
  )
}
