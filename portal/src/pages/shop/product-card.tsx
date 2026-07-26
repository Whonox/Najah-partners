import { Minus, Plus, ShoppingBasket } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProductImage } from "@/components/common/product-image"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { formatDt, formatPoints } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"
import type { Product } from "@/api/queries/shop"

/**
 * CARTE PRODUIT — la brique de la boutique, partagée par les deux parcours.
 *
 * ═══ L'IMAGE D'ABORD, PARCE QUE C'EST UNE BOUTIQUE ═══
 * La T9 listait des produits comme des lignes de back-office : nom, prix, points, boutons. On
 * y choisissait par lecture. Une boutique se parcourt du regard — d'où une vignette en tête de
 * carte, servie par `ProductImage`, qui retombe seule sur un placeholder tant qu'aucune photo
 * n'a été déposée (D-054). Le catalogue reste donc présentable avant même la première photo.
 *
 * ═══ LES DEUX DIMENSIONS NE SE RESSEMBLENT PAS (D-028) ═══
 * Le prix en DINARS est le chiffre le plus gros de la carte ; les POINTS sont une PASTILLE
 * posée sur l'image, dans un registre visuel entièrement différent. C'est délibéré : les
 * afficher côte à côte, en même corps et même couleur, invite à les additionner ou à les
 * convertir — et il n'existe aucune conversion. Deux natures, deux traitements.
 *
 * ═══ CE QUE LA CARTE NE DÉCIDE PAS ═══
 * Elle ne connaît ni palier, ni montant dû, ni parcours. Elle montre un produit et rapporte
 * une quantité. C'est l'écran appelant qui sait ce qu'un ajout signifie — s'approcher d'un
 * palier en points, ou grossir une somme en dinars.
 */
export function ProductCard({
  product,
  categoryName,
  quantity,
  onQuantityChange,
}: {
  product: Product
  /** Nom de la catégorie — sert au dégradé du placeholder, jamais à une règle. */
  categoryName?: string | null
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
  const inCart = quantity > 0

  return (
    <div
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl bg-card transition-shadow",
        // Une carte au panier se signale par un LISERÉ, pas par un fond teinté : le fond
        // porte déjà la vignette, et le teinter fausserait les couleurs de la photo.
        inCart ? "ring-2 ring-primary" : "ring-1 ring-border",
        soldOut && "opacity-60",
      )}
    >
      <div className="relative">
        <ProductImage
          productId={product.id}
          name={product.name}
          categoryName={categoryName}
          imageCount={product.imageCount}
          // Le nom est écrit juste dessous : le répéter dans le placeholder le ferait
          // apparaître deux fois de suite sur la même carte.
          showName={false}
          className="rounded-none"
        />

        {/* Les POINTS, sur l'image : une valeur d'arbre, pas un prix. */}
        <span className="absolute bottom-2 start-2 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur">
          <PointsBv value={product.valueBv} className="text-xs" />
        </span>

        {promo && (
          <Badge className="absolute top-2 end-2 shadow-sm">{t("shop.promo")}</Badge>
        )}

        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-medium">
            {t("shop.outOfStock")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-h-10">
          <h3 className="text-sm font-medium leading-tight">{product.name}</h3>
          {product.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {product.description}
            </p>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <MoneyDt value={effectivePrice} className="text-lg font-semibold" />
          {promo && (
            <span className="text-xs text-muted-foreground line-through">
              {formatDt(product.priceDt)}
            </span>
          )}
        </div>

        {/* Le stock et les FRAIS DE LIVRAISON, toujours à part et jamais additionnés : la
            plateforme ne les encaisse pas, ils se règlent au livreur. */}
        <p className="text-xs text-muted-foreground">
          {soldOut
            ? t("shop.outOfStock")
            : unlimited
              ? t("shop.unlimited")
              : t("shop.stockLeft", { count: formatPoints(product.stock ?? 0) })}
          {product.shippingFeeDt && Number(product.shippingFeeDt) > 0 ? (
            <>
              {" · "}
              {t("shop.shippingFee")} {formatDt(product.shippingFeeDt)} {t("unit.dt")}
            </>
          ) : null}
        </p>

        <div className="mt-auto pt-1">
          {inCart ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("shop.removeOne", { name: product.name })}
                onClick={() => onQuantityChange(quantity - 1)}
              >
                <Minus />
              </Button>
              <span
                className="flex-1 text-center text-sm font-semibold tabular-nums"
                aria-label={t("shop.quantity")}
              >
                {quantity}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("shop.addOne", { name: product.name })}
                disabled={quantity >= maxQuantity}
                onClick={() => onQuantityChange(quantity + 1)}
              >
                <Plus />
              </Button>
            </div>
          ) : (
            /* Panier vide sur ce produit : UN seul bouton pleine largeur plutôt qu'un
               « − 0 + ». Un compteur à zéro flanqué d'un moins désactivé demande de
               comprendre un widget avant de pouvoir ajouter quoi que ce soit. */
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={soldOut}
              aria-label={t("shop.addOne", { name: product.name })}
              onClick={() => onQuantityChange(1)}
            >
              <ShoppingBasket />
              {t("shop.add")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
