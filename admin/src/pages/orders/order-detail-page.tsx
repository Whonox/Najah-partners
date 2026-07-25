import { useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import { ArrowLeft, Info, Truck } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { errorMessage } from "@/api/error"
import { NEXT_SHIPMENT_STATUS } from "@/api/enums"
import {
  orderQueryOptions,
  useUpdateShipment,
  type Order,
} from "@/api/queries/orders"
import { DataState } from "@/components/common/data-state"
import { TableShell } from "@/components/common/data-table"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { PageHeader } from "@/components/common/page-header"
import {
  OrderContextBadge,
  ShipmentBadge,
} from "@/components/common/status-badge"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * Détail d'une commande (spec §7.2.6). Ce que cet écran doit rendre évident :
 *
 *  — chaque ligne porte SES PROPRES snapshots (points et prix unitaires figés au checkout) :
 *    revaloriser un produit aujourd'hui ne réécrit pas cette commande ;
 *  — les e-cards sont désignées par leur IDENTIFIANT et jamais par leur code — un code est de
 *    la valeur au porteur, il ne sort d'aucune vue ;
 *  — la SEULE action possible est l'avancement du colis. Aucune annulation : les e-cards sont
 *    brûlées et `USED` est irréversible.
 */
export function OrderDetailPage() {
  const t = useT()
  const params = useParams()
  const orderId = Number(params.orderId)
  const query = useQuery(orderQueryOptions(orderId))

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ms-2" nativeButton={false}
              render={<Link to="/orders" />}>
        <ArrowLeft />
        {t("orders.title")}
      </Button>

      <DataState
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        rows={6}
      >
        {query.data ? <OrderDetailView order={query.data} /> : null}
      </DataState>
    </div>
  )
}

function OrderDetailView({ order }: { order: Order }) {
  const t = useT()
  const { hasRole } = useAuth()
  const canShip = hasRole(["SUPER_ADMIN", "MANAGER"])
  const updateShipment = useUpdateShipment()

  const shipmentStatus = order.shipmentStatus ?? null
  const next = shipmentStatus ? NEXT_SHIPMENT_STATUS[shipmentStatus] : null
  const [confirmingShipment, setConfirmingShipment] = useState(false)

  /**
   * L'avancement d'expédition est IRRÉVERSIBLE — il n'existe aucune « dé-livraison », ni ici ni
   * côté backend. Il gagne donc une confirmation thémée en Tranche 8c : l'audit de T8b avait
   * relevé l'incohérence inverse (une confirmation sur une suppression de catégorie vide,
   * aucune sur un changement d'état définitif). Les deux sont désormais calées sur la gravité
   * RÉELLE, et non sur l'habitude.
   */
  function advance() {
    if (!next) return
    updateShipment.mutate(
      { id: order.id, status: next },
      {
        onSuccess: () => {
          toast.success(t("orders.shipmentUpdated"))
          setConfirmingShipment(false)
        },
        onError: (error) => {
          toast.error(t("common.saveFailed"), { description: errorMessage(error) })
          setConfirmingShipment(false)
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t("orders.detailTitle")} #${order.id}`}
        description={formatDateTime(order.createdAt)}
        actions={
          <div className="flex items-center gap-2">
            <OrderContextBadge context={order.context} />
            <ShipmentBadge status={shipmentStatus} />
          </div>
        }
      />

      {order.context === "ACTIVATION" ? (
        <Alert>
          <Info />
          <AlertDescription>{t("orders.activationHint")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t("orders.section.payment")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            {/* Les deux totaux, l'un sous l'autre mais dans deux unités distinctes. */}
            <Field label={t("orders.column.totalDt")}>
              <MoneyDt value={order.totalDt} />
            </Field>
            <Field label={t("orders.column.totalPoints")}>
              <PointsBv value={order.totalPoints} />
            </Field>
            <Field label={t("orders.column.status")}>
              {t(`orderStatus.${order.status}`)}
            </Field>
            <Field label={t("orders.field.paidAt")}>
              {order.paidAt ? formatDateTime(order.paidAt) : t("common.none")}
            </Field>
            {/* Code membre + nom : la clé métier, jamais l'identifiant technique. */}
            <Field label={t("orders.column.member")}>
              <Link
                to={`/members/${order.memberId}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                <span className="font-mono text-xs">
                  {order.member.memberCode}
                </span>{" "}
                {order.member.lastName} {order.member.firstName}
              </Link>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t("orders.column.ecards")}
            </CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("orders.ecardHint")}
            </p>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="tabular-nums">
              {order.ecardIds.length} {t("orders.ecardCount")}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {order.ecardIds.map((id) => (
                <li
                  key={id}
                  className="rounded-md border px-2 py-0.5 font-mono text-xs text-muted-foreground"
                >
                  #{id}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t("orders.section.shipping")}
            </CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("orders.shipmentHint")}
            </p>
          </CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            <Field label={t("orders.field.address")}>
              {order.shippingAddress ?? t("common.none")}
            </Field>
            {/* Aucun produit PHYSIQUE → il n'y a rien à expédier. On le DIT, plutôt que de
                laisser un bouton inerte laisser croire à une étape bloquée. */}
            {shipmentStatus === null ? (
              <p className="text-muted-foreground">{t("orders.noShipment")}</p>
            ) : (
              <>
                <Field label={t("orders.column.shipment")}>
                  <ShipmentBadge status={shipmentStatus} />
                </Field>
                {canShip && next ? (
                  <Button
                    size="sm"
                    disabled={updateShipment.isPending}
                    onClick={() => setConfirmingShipment(true)}
                  >
                    <Truck />
                    {t("orders.advanceShipment")} — {t(`shipment.${next}`)}
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{t("orders.section.lines")}</h2>
        <p className="text-xs text-muted-foreground">{t("orders.snapshotHint")}</p>
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("orders.column.product")}</TableHead>
                <TableHead className="w-20">
                  {t("orders.column.quantity")}
                </TableHead>
                <TableHead className="w-36">
                  {t("orders.column.unitPoints")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("orders.column.unitPrice")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.productId}>
                  <TableCell className="font-medium">
                    {line.productName}
                  </TableCell>
                  <TableCell className="tabular-nums">{line.quantity}</TableCell>
                  <TableCell>
                    <PointsBv value={line.unitValueBv} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={line.unitPriceDt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </div>

      <ConfirmDialog
        open={confirmingShipment}
        title={t("orders.advanceConfirmTitle")}
        summary={
          next ? (
            <span>
              #{order.id} · {t(`shipment.${shipmentStatus ?? "PREPARATION"}`)} →{" "}
              <span className="font-medium">{t(`shipment.${next}`)}</span>
            </span>
          ) : null
        }
        consequence={t("orders.advanceConsequence")}
        confirmLabel={t("orders.advanceShipment")}
        destructive={false}
        pending={updateShipment.isPending}
        onConfirm={advance}
        onCancel={() => setConfirmingShipment(false)}
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end font-medium">{children}</span>
    </div>
  )
}
