import { useState, type ReactNode } from "react"
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { fromMillimes, sumMillimes } from "@/lib/money"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"
import type { CartLine } from "./cart"

/**
 * LE PANIER — une barre toujours visible, un panneau latéral au détail.
 *
 * ═══ POURQUOI DEUX PIÈCES ET PAS UNE ═══
 * Le panier doit répondre en permanence à une question — « où j'en suis » — et sur demande à
 * une autre — « qu'est-ce que j'ai mis ». La première ne peut pas coûter un clic : en
 * activation, c'est la distance au palier EN POINTS, et un affilié qui doit ouvrir un tiroir
 * pour la lire compose à l'aveugle. La seconde n'a pas à occuper l'écran en permanence : une
 * liste de lignes prend la place des produits qu'on est en train de choisir.
 *
 * D'où la barre COLLANTE (sous l'en-tête, `top-16`) qui porte le résumé, et le panneau LATÉRAL
 * qui porte le détail et les actions.
 *
 * ═══ POURQUOI LA BARRE EST EN HAUT ET NON EN BAS ═══
 * Sous `lg`, la barre d'onglets du portail occupe déjà le bas de l'écran (`AppShell`). Un
 * panier fixé en bas se poserait dessus ou juste au-dessus, dans les deux cas en gênant la
 * navigation. En haut, il se glisse sous l'en-tête et ne recouvre rien.
 *
 * ═══ CE QUE LE PANIER NE CALCULE PAS ═══
 * Il additionne des quantités et des prix AFFICHÉS, pour guider. Le montant qui engage est
 * celui que le backend impose, recalculé sous verrou contre les prix relus au moment de la
 * transaction (D-027). Un écart entre les deux se règle toujours en faveur du backend.
 */
export function CartPanel({
  lines,
  onQuantityChange,
  onClear,
  summary,
  detail,
  footer,
  tone = "default",
}: {
  lines: CartLine[]
  onQuantityChange: (productId: number, quantity: number) => void
  onClear: () => void
  /** Le résumé permanent, dans la barre collante. Ce qu'il faut voir sans rien ouvrir. */
  summary: ReactNode
  /** Bloc de totaux, sous les lignes du panneau. */
  detail?: ReactNode
  /** Actions du panneau (continuer, payer…). */
  footer?: ReactNode
  /**
   * Registre visuel de la barre. `success` quand la condition du parcours est remplie (palier
   * atteint) — un état atteint doit se voir sans lire.
   */
  tone?: "default" | "success"
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const count = lines.reduce((total, line) => total + line.quantity, 0)

  return (
    <>
      <div
        className={cn(
          "sticky top-16 z-20 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm ring-1 backdrop-blur",
          tone === "success"
            ? "bg-success/10 ring-success/40"
            : "bg-card/95 ring-border",
        )}
      >
        <div className="min-w-0 flex-1">{summary}</div>

        <Button
          variant={tone === "success" ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          onClick={() => setOpen(true)}
          disabled={count === 0}
          // Sous `sm`, le mot « panier » est masqué pour tenir dans la barre : sans ce
          // libellé, le bouton s'annoncerait « 2 » — un nombre, sans rien pour dire de quoi.
          aria-label={t("shop.openCart", { count })}
        >
          <ShoppingCart />
          <span className="hidden sm:inline" aria-hidden>
            {t("shop.cart")}
          </span>
          <span className="tabular-nums" aria-hidden>
            {count}
          </span>
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        {/* `side` n'accepte que des directions PHYSIQUES : le panneau s'ouvrira à droite même
            en arabe, où il devrait venir de la gauche. La limite est celle du composant
            partagé, pas de cet écran — c'est là qu'il faudra la lever au passage RTL. */}
        <SheetContent
          side="right"
          closeLabel={t("action.close")}
          className="flex flex-col gap-0"
        >
          <SheetHeader className="border-b">
            <SheetTitle>{t("shop.cart")}</SheetTitle>
            <SheetDescription>{t("shop.cartDescription")}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("shop.cartEmpty")}
              </p>
            ) : (
              <ul className="space-y-3">
                {lines.map((line) => (
                  <CartRow
                    key={line.product.id}
                    line={line}
                    onQuantityChange={(quantity) =>
                      onQuantityChange(line.product.id, quantity)
                    }
                  />
                ))}
              </ul>
            )}

            {lines.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-muted-foreground"
                onClick={onClear}
              >
                <Trash2 />
                {t("shop.clearCart")}
              </Button>
            )}

            {detail && <div className="mt-5 border-t pt-4">{detail}</div>}
          </div>

          {footer && (
            <div className="space-y-2 border-t p-4">
              {footer}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

/**
 * Une ligne du panier. Elle porte les DEUX dimensions du produit (D-028) : le sous-total en
 * dinars, et les points de la ligne — parce que c'est exactement là, ligne par ligne, qu'un
 * affilié comprend pourquoi son panier atteint 950 points et pas 1000.
 */
function CartRow({
  line,
  onQuantityChange,
}: {
  line: CartLine
  onQuantityChange: (quantity: number) => void
}) {
  const t = useT()
  const unit = line.product.promoPriceDt ?? line.product.priceDt
  const subtotal = fromMillimes(
    sumMillimes(Array.from({ length: line.quantity }, () => unit)),
  )

  const unlimited = line.product.stock === null || line.product.stock === undefined
  const maxQuantity = unlimited ? Infinity : (line.product.stock ?? 0)

  return (
    <li className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{line.product.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <PointsBv value={line.product.valueBv * line.quantity} className="text-xs" />
        </p>

        <div className="mt-1.5 flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-xs"
            aria-label={t("shop.removeOne", { name: line.product.name })}
            onClick={() => onQuantityChange(line.quantity - 1)}
          >
            <Minus />
          </Button>
          <span
            className="min-w-6 text-center text-sm tabular-nums"
            aria-label={t("shop.quantity")}
          >
            {line.quantity}
          </span>
          <Button
            variant="outline"
            size="icon-xs"
            aria-label={t("shop.addOne", { name: line.product.name })}
            disabled={line.quantity >= maxQuantity}
            onClick={() => onQuantityChange(line.quantity + 1)}
          >
            <Plus />
          </Button>
        </div>
      </div>

      <MoneyDt value={subtotal} className="shrink-0 text-sm font-medium" />
    </li>
  )
}
