import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Ban, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EcardPayment } from "@/components/common/ecard-payment"
import { PageHeader } from "@/components/common/page-header"
import { Explain, Notice } from "@/components/common/explain"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { errorMessage } from "@/api/error"
import { productsQueryOptions, useFreeCheckout } from "@/api/queries/shop"
import { fromMillimes, sumMillimes } from "@/lib/money"
import { useT } from "@/i18n/use-t"
import { cartTotals, type Cart } from "./cart"
import { CartPanel } from "./cart-panel"
import { CatalogGrid } from "./catalog-grid"

/**
 * ACHAT LIBRE (spec §7.1.4b) — réservé aux comptes ACTIFS.
 *
 * ═══ LE MALENTENDU À TUER DANS L'ŒUF ═══
 * Acheter des produits ici ne rapporte AUCUN point et ne fait progresser aucun équilibre
 * (D-005) : seule une activation injecte des points dans l'arbre. Un affilié qui l'ignore
 * achète en croyant faire monter ses jambes, puis réclame. L'avertissement est donc en TÊTE
 * d'écran, avant le catalogue, et pas en pied de page ni en petits caractères.
 *
 * Les points des produits restent AFFICHÉS — ils existent, ils composent les paliers — mais
 * l'écran répète, dans le panier et jusque sur le récapitulatif, qu'ils ne vont nulle part
 * ici. Les masquer aurait été le mensonge inverse : on les retrouverait ailleurs sans
 * comprendre pourquoi ils avaient disparu.
 *
 * ═══ CE QUI LE DISTINGUE VISUELLEMENT DE L'ACTIVATION ═══
 * Pas de fil d'étapes, pas de palier, pas de compte à rebours en points : deux vues seulement,
 * la boutique puis le paiement, avec un retour. L'activation est un passage unique et engageant
 * qu'on franchit une fois dans sa vie ; un achat libre se refait le mois suivant. Leur donner
 * la même mise en scène aurait brouillé les deux.
 */
export function FreePurchase() {
  const t = useT()
  const products = useQuery(productsQueryOptions())
  const checkout = useFreeCheckout()

  const [cart, setCart] = useState<Cart>({})
  const [codes, setCodes] = useState<string[]>([])
  const [address, setAddress] = useState("")
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState(false)

  const totals = cartTotals(products.data ?? [], cart)
  const dueDt = fromMillimes(sumMillimes(totals.prices))
  const itemCount = totals.lines.reduce((n, line) => n + line.quantity, 0)

  function setQuantity(productId: number, quantity: number) {
    setCart((current) => {
      const next = { ...current }
      if (quantity <= 0) delete next[productId]
      else next[productId] = quantity
      return next
    })
  }

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
      setPaying(false)
      setDone(true)
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
        <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
        <h2 className="mt-4 text-xl font-semibold">{t("free.success")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {t("free.successBody")}
        </p>
        <Button className="mt-5" variant="outline" onClick={() => setDone(false)}>
          {t("free.backToShop")}
        </Button>
      </div>
    )
  }

  if (paying) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ms-2" onClick={() => setPaying(false)}>
          <ArrowLeft />
          {t("free.backToShop")}
        </Button>

        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <h2 className="text-lg font-semibold">{t("free.dueTitle")}</h2>
          <p className="mt-1 text-3xl font-semibold">
            <MoneyDt value={dueDt} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("free.dueHint")}</p>

          <ul className="mt-4 space-y-2 border-t pt-4 text-sm">
            {totals.lines.map((line) => (
              <li key={line.product.id} className="flex items-baseline justify-between gap-3">
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

          {/* Les points du panier, une dernière fois, et une dernière fois dits SANS EFFET.
              C'est le moment où l'affilié valide — s'il croyait acheter des points, c'est ici
              qu'il faut que le doute se lève. */}
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Ban className="size-3.5" aria-hidden />
              {t("free.pointsNoEffect")}
            </span>
            <PointsBv value={totals.totalPoints} />
          </p>
        </div>

        <div className="space-y-4 rounded-2xl bg-card p-5 ring-1 ring-border">
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

          {checkout.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(checkout.error)}</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={codes.length === 0 || checkout.isPending}
            onClick={() => void submit()}
          >
            {checkout.isPending ? t("shop.checkingOut") : t("shop.checkout")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t("payment.noGateway")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t("shop.title")} description={t("shop.subtitleFree")} />

      <Notice tone="warning" title={t("explain.noPointsOnPurchase.title")}>
        {t("explain.noPointsOnPurchase.body")}
      </Notice>

      <CartPanel
        lines={totals.lines}
        onQuantityChange={setQuantity}
        onClear={() => setCart({})}
        summary={
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{t("free.dueTitle")}</span>
              <MoneyDt value={dueDt} className="font-semibold" />
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {itemCount === 0
                ? t("shop.cartEmpty")
                : t("shop.cartItemsCount", { count: itemCount })}
            </p>
          </>
        }
        detail={
          <div className="space-y-2 text-sm">
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{t("free.dueTitle")}</span>
              <MoneyDt value={dueDt} className="font-semibold" />
            </p>
            <p className="flex items-baseline justify-between gap-3 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Ban className="size-3.5" aria-hidden />
                {t("free.pointsNoEffect")}
              </span>
              <PointsBv value={totals.totalPoints} />
            </p>
          </div>
        }
        footer={
          <Button className="w-full" disabled={itemCount === 0} onClick={() => setPaying(true)}>
            {t("free.toPayment")}
            <ArrowRight />
          </Button>
        }
      />

      <CatalogGrid cart={cart} onChange={setCart} />

      <Explain
        titleKey="explain.noPointsOnPurchase.title"
        bodyKey="explain.noPointsOnPurchase.body"
      />

      <Button
        className="w-full"
        size="lg"
        disabled={itemCount === 0}
        onClick={() => setPaying(true)}
      >
        {t("free.toPayment")}
        <ArrowRight />
      </Button>
    </div>
  )
}
