import { Minus, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { formatDt } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import type { Product } from "@/api/queries/shop"
import type { Cart } from "./cart"

/**
 * Le catalogue et le panier, en composant CONTRÔLÉ : c'est l'écran appelant (activation ou
 * achat libre) qui détient le panier, parce que les deux parcours n'en font pas la même chose
 * — l'un vise un nombre de POINTS exact, l'autre une somme de DINARS.
 *
 * CHAQUE PRODUIT MONTRE SES DEUX DIMENSIONS (D-028), toujours dans le même ordre et avec les
 * mêmes composants : le prix en dinars, la valeur en points. C'est ici que la confusion serait
 * la plus coûteuse — un affilié qui croit composer un palier avec des dinars se retrouve avec
 * un panier refusé sans comprendre pourquoi.
 *
 * Les FRAIS DE LIVRAISON sont affichés quand ils existent, mais toujours à part et jamais
 * additionnés : la plateforme ne les encaisse pas, ils se règlent au livreur.
 */
export function ProductPicker({
  products,
  cart,
  onChange,
}: {
  products: Product[]
  cart: Cart
  onChange: (cart: Cart) => void
}) {
  function setQuantity(productId: number, quantity: number) {
    const next = { ...cart }
    if (quantity <= 0) {
      delete next[productId]
    } else {
      next[productId] = quantity
    }
    onChange(next)
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            quantity={cart[product.id] ?? 0}
            onQuantityChange={(quantity) => setQuantity(product.id, quantity)}
          />
        </li>
      ))}
    </ul>
  )
}

function ProductCard({
  product,
  quantity,
  onQuantityChange,
}: {
  product: Product
  quantity: number
  onQuantityChange: (quantity: number) => void
}) {
  const t = useT()

  // `stock` à `null` ne veut pas dire « inconnu » mais « sans objet » : un produit VIRTUEL est
  // illimité (CHECK en base). Le confondre avec une rupture masquerait des produits vendables.
  const unlimited = product.stock === null || product.stock === undefined
  const soldOut = !unlimited && (product.stock ?? 0) <= 0
  const maxQuantity = unlimited ? Infinity : (product.stock ?? 0)

  const promo = product.promoPriceDt !== null && product.promoPriceDt !== undefined
  const effectivePrice = promo ? product.promoPriceDt : product.priceDt

  return (
    <Card className={soldOut ? "opacity-60" : undefined}>
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium leading-tight">{product.name}</h3>
            {promo ? <Badge variant="secondary">{t("shop.promo")}</Badge> : null}
          </div>
          {product.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {product.description}
            </p>
          ) : null}
        </div>

        {/* Les deux dimensions, côte à côte et visuellement distinctes. */}
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">{t("shop.cartPrice")}</dt>
            <dd className="text-lg font-semibold">
              <MoneyDt value={effectivePrice} />
            </dd>
            {promo ? (
              <span className="text-xs text-muted-foreground line-through">
                {formatDt(product.priceDt)}
              </span>
            ) : null}
          </div>
          <div>
            <dt className="sr-only">{t("shop.cartPoints")}</dt>
            <dd className="text-sm text-muted-foreground">
              <PointsBv value={product.valueBv} />
            </dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">
          {soldOut
            ? t("shop.outOfStock")
            : unlimited
              ? t("shop.unlimited")
              : t("shop.stockLeft", { count: product.stock ?? 0 })}
          {product.shippingFeeDt && Number(product.shippingFeeDt) > 0 ? (
            <> · {t("shop.shippingFee")} : {formatDt(product.shippingFeeDt)} {t("unit.dt")}</>
          ) : null}
        </p>

        <div className="mt-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("shop.remove")}
            disabled={quantity === 0}
            onClick={() => onQuantityChange(quantity - 1)}
          >
            <Minus />
          </Button>
          <span
            className="min-w-8 text-center font-medium tabular-nums"
            aria-label={t("shop.quantity")}
          >
            {quantity}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("shop.add")}
            disabled={soldOut || quantity >= maxQuantity}
            onClick={() => onQuantityChange(quantity + 1)}
          >
            <Plus />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
