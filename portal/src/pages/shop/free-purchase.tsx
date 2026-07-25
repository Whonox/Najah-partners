import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataState } from "@/components/common/data-state"
import { EcardPayment } from "@/components/common/ecard-payment"
import { Explain, Notice } from "@/components/common/explain"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { errorMessage } from "@/api/error"
import { productsQueryOptions, useFreeCheckout } from "@/api/queries/shop"
import { fromMillimes, sumMillimes } from "@/lib/money"
import { useT } from "@/i18n/use-t"
import { cartTotals, type Cart } from "./cart"
import { ProductPicker } from "./product-picker"

/**
 * ACHAT LIBRE (spec §7.1.4b) — réservé aux comptes ACTIFS.
 *
 * ═══ LE MALENTENDU À TUER DANS L'ŒUF ═══
 * Acheter des produits ici ne rapporte AUCUN point et ne fait progresser aucun équilibre
 * (D-005) : seule une activation injecte des points dans l'arbre. Un affilié qui l'ignore
 * achète en croyant faire monter ses jambes, puis réclame. L'écran le dit donc explicitement,
 * en tête, et pas en petits caractères — les points des produits restent affichés (ils
 * existent, ils servent aux paliers) mais l'écran précise qu'ils ne vont nulle part ici.
 *
 * Le montant dû est la SOMME DES PRIX du panier — contrairement à l'activation, où c'est le
 * prix du pack qui commande.
 */
export function FreePurchase() {
  const t = useT()
  const products = useQuery(productsQueryOptions())
  const checkout = useFreeCheckout()

  const [cart, setCart] = useState<Cart>({})
  const [codes, setCodes] = useState<string[]>([])
  const [address, setAddress] = useState("")

  const totals = cartTotals(products.data ?? [], cart)
  const dueDt = fromMillimes(sumMillimes(totals.prices))
  const hasItems = totals.lines.length > 0

  async function submit() {
    try {
      await checkout.mutateAsync({
        items: totals.lines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
        ecardCodes: codes,
        shippingAddress: address.trim() === "" ? undefined : address.trim(),
      })
      toast.success(t("free.success"))
      setCart({})
      setCodes([])
      setAddress("")
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  return (
    <div className="space-y-6">
      <Notice tone="warning" title={t("explain.noPointsOnPurchase.title")}>
        {t("explain.noPointsOnPurchase.body")}
      </Notice>

      <DataState
        isLoading={products.isPending}
        error={products.error}
        isEmpty={products.data?.length === 0}
        emptyMessage={t("shop.empty")}
        onRetry={() => void products.refetch()}
      >
        <ProductPicker products={products.data ?? []} cart={cart} onChange={setCart} />
      </DataState>

      <Card>
        <CardHeader>
          <CardTitle>{t("shop.cart")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasItems ? (
            <>
              <ul className="space-y-2 text-sm">
                {totals.lines.map((line) => (
                  <li
                    key={line.product.id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {line.product.name}
                      <span className="text-muted-foreground"> × {line.quantity}</span>
                    </span>
                    <MoneyDt
                      value={fromMillimes(
                        sumMillimes(
                          Array.from(
                            { length: line.quantity },
                            () => line.product.promoPriceDt ?? line.product.priceDt,
                          ),
                        ),
                      )}
                    />
                  </li>
                ))}
              </ul>

              <div className="space-y-1.5 border-t pt-3">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{t("free.dueTitle")}</span>
                  <MoneyDt value={dueDt} className="text-lg font-semibold" />
                </p>
                <p className="text-xs text-muted-foreground">{t("free.dueHint")}</p>
                {/* Les points du panier sont montrés, mais dits SANS EFFET : les masquer
                    laisserait croire qu'ils n'existent pas, alors qu'ils composent bien les
                    paliers — ailleurs. */}
                <p className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
                  <span>{t("shop.cartPoints")}</span>
                  <PointsBv value={totals.totalPoints} />
                </p>
              </div>

              <Explain
                titleKey="explain.noPointsOnPurchase.title"
                bodyKey="explain.noPointsOnPurchase.body"
              />

              <EcardPayment
                dueDt={dueDt}
                codes={codes}
                onChange={setCodes}
                disabled={checkout.isPending}
              />

              <div className="space-y-1.5">
                <Label htmlFor="free-address">{t("shop.shipping")}</Label>
                <Input
                  id="free-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("shop.shippingOptional")}</p>
              </div>

              <Notice>{t("shop.shippingOutside")}</Notice>

              {checkout.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage(checkout.error)}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                className="w-full"
                disabled={codes.length === 0 || checkout.isPending}
                onClick={() => void submit()}
              >
                {checkout.isPending ? t("shop.checkingOut") : t("shop.checkout")}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {t("payment.noGateway")}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("shop.cartEmpty")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
