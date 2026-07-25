import { Link, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataState } from "@/components/common/data-state"
import { Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { OrderContextBadge, ShipmentBadge } from "@/components/common/status-badge"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { myOrderQueryOptions } from "@/api/queries/shop"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * DÉTAIL D'UNE COMMANDE.
 *
 * Les prix et les points par ligne sont les SNAPSHOTS du jour de l'achat (D-028, §5.8) : c'est
 * dit à l'écran, sinon un affilié qui revoit une commande ancienne après une revalorisation
 * croirait à une erreur.
 *
 * Les e-cards qui ont réglé la commande sont désignées par leur IDENTIFIANT, jamais par leur
 * code : le code n'existe plus nulle part côté serveur (D-048). Ce qui est utile ici, c'est
 * COMBIEN de cartes ont servi — l'affilié y retrouve son paiement.
 */
export function OrderDetailPage() {
  const t = useT()
  const params = useParams()
  const orderId = Number(params.orderId)
  const order = useQuery(myOrderQueryOptions(orderId))

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/commandes" />}>
        <ArrowLeft />
        {t("orders.back")}
      </Button>

      <DataState
        isLoading={order.isPending}
        error={order.error}
        onRetry={() => void order.refetch()}
        rows={3}
      >
        {order.data ? (
          <div className="space-y-6">
            <PageHeader
              title={t("orders.number", { id: order.data.id })}
              description={formatDateTime(order.data.createdAt)}
              actions={<OrderContextBadge context={order.data.context} />}
            />

            <Card>
              <CardContent className="grid grid-cols-2 gap-4 p-4">
                <Figure
                  label={t("orders.total")}
                  value={<MoneyDt value={order.data.totalDt} className="text-lg" />}
                />
                <Figure
                  label={t("orders.points")}
                  value={<PointsBv value={order.data.totalPoints} className="text-lg" />}
                />
                <Figure
                  label={t("orders.shipment")}
                  value={<ShipmentBadge status={order.data.shipmentStatus} />}
                />
                <Figure
                  label={t("payment.title")}
                  value={
                    <span className="text-sm">
                      {t("orders.ecards", { count: order.data.ecardIds.length })}
                    </span>
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("orders.lines")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-3">
                  {order.data.lines.map((line) => (
                    <li
                      key={line.productId}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-3 last:border-0 last:pb-0"
                    >
                      <span className="min-w-0 flex-1 font-medium">
                        {line.productName}
                        <span className="text-muted-foreground">
                          {" "}
                          {t("orders.quantity")} {line.quantity}
                        </span>
                      </span>
                      <span className="flex items-baseline gap-4 text-sm">
                        <MoneyDt value={line.unitPriceDt} />
                        <PointsBv value={line.unitValueBv} className="text-muted-foreground" />
                      </span>
                    </li>
                  ))}
                </ul>

                <Notice>{t("orders.snapshotNote")}</Notice>
              </CardContent>
            </Card>

            {order.data.shippingAddress ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t("shop.shipping")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{order.data.shippingAddress}</p>
                  <Notice>{t("shop.shippingOutside")}</Notice>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </DataState>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="font-medium">{value}</div>
    </div>
  )
}
