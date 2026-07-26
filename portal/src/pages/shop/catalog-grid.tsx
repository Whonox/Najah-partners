import { useMemo, useState } from "react"
import { LayoutGrid } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { DataState } from "@/components/common/data-state"
import { categoriesQueryOptions, productsQueryOptions } from "@/api/queries/shop"
import type { Product } from "@/api/queries/shop"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"
import type { Cart } from "./cart"
import { ProductCard } from "./product-card"

const ALL = "all" as const

/**
 * LE CATALOGUE — onglets de catégories et grille de cartes, partagés par les deux parcours.
 *
 * ═══ LE FILTRE EST LOCAL, ET C'EST UN CHOIX ═══
 * `GET /shop/products` accepte un `categoryId`, mais le catalogue tient en quelques dizaines de
 * lignes : on le charge UNE fois et on filtre en mémoire. Changer d'onglet est alors instantané
 * et ne fait pas clignoter la grille à chaque clic. Le jour où le catalogue grossit, la bascule
 * vers le filtre serveur tient dans ces quatre lignes — pas dans l'écran.
 *
 * ═══ POURQUOI PAS `<Tabs>` DE SHADCN ═══
 * `Tabs` associe chaque onglet à un PANNEAU distinct. Ici il n'y a qu'une grille, dont le
 * contenu se restreint : rendre autant de panneaux que de catégories démonterait et
 * remonterait la liste à chaque bascule, en perdant la position de défilement. Une barre de
 * boutons `aria-pressed` dit exactement ce qui se passe — un filtre, pas une navigation.
 *
 * ═══ « TOUT » EST TOUJOURS PREMIER ═══
 * C'est l'état par défaut et le retour en arrière. Une boutique qui s'ouvre sur une catégorie
 * arbitraire laisse croire que le reste n'existe pas.
 */
export function CatalogGrid({
  cart,
  onChange,
  disabled,
}: {
  cart: Cart
  onChange: (cart: Cart) => void
  /** Paiement en cours : on fige le catalogue plutôt que de laisser modifier un panier envoyé. */
  disabled?: boolean
}) {
  const t = useT()
  const products = useQuery(productsQueryOptions())
  const categories = useQuery(categoriesQueryOptions())
  const [active, setActive] = useState<number | typeof ALL>(ALL)

  /** Id → nom, pour la vignette de repli d'un produit sans photo (le placeholder par famille). */
  const categoryNames = useMemo(() => {
    const names = new Map<number, string>()
    for (const category of categories.data ?? []) names.set(category.id, category.name)
    return names
  }, [categories.data])

  /**
   * Seules les catégories qui ONT des produits visibles apparaissent. Un onglet qui ouvre sur
   * une grille vide est une impasse : l'affilié croit à un problème de chargement.
   */
  const tabs = useMemo(() => {
    const counts = new Map<number, number>()
    for (const product of products.data ?? []) {
      counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1)
    }
    return (categories.data ?? [])
      .filter((category) => counts.has(category.id))
      .map((category) => ({ ...category, count: counts.get(category.id) ?? 0 }))
  }, [categories.data, products.data])

  const visible: Product[] =
    active === ALL
      ? (products.data ?? [])
      : (products.data ?? []).filter((product) => product.categoryId === active)

  function setQuantity(productId: number, quantity: number) {
    const next = { ...cart }
    if (quantity <= 0) delete next[productId]
    else next[productId] = quantity
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {tabs.length > 0 && (
        <div
          role="group"
          aria-label={t("shop.categories")}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0"
        >
          <CategoryTab
            label={t("shop.allCategories")}
            count={products.data?.length ?? 0}
            active={active === ALL}
            onClick={() => setActive(ALL)}
            icon
          />
          {tabs.map((category) => (
            <CategoryTab
              key={category.id}
              label={category.name}
              count={category.count}
              active={active === category.id}
              onClick={() => setActive(category.id)}
            />
          ))}
        </div>
      )}

      <DataState
        isLoading={products.isPending}
        error={products.error}
        isEmpty={visible.length === 0}
        emptyMessage={t("shop.empty")}
        onRetry={() => void products.refetch()}
        rows={4}
      >
        {/* Deux colonnes au téléphone, TROIS dès la tablette. À 768 px sur deux colonnes, une
            vignette en 4/3 fait 260 px de haut : on ne voit plus qu'un produit et demi par
            écran, et l'image écrase le prix qu'on est venu comparer. */}
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {visible.map((product) => (
            <li key={product.id}>
              <ProductCard
                product={product}
                categoryName={categoryNames.get(product.categoryId)}
                quantity={cart[product.id] ?? 0}
                onQuantityChange={(quantity) =>
                  disabled ? undefined : setQuantity(product.id, quantity)
                }
              />
            </li>
          ))}
        </ul>
      </DataState>
    </div>
  )
}

/**
 * Un onglet de catégorie. Le COMPTEUR n'est pas décoratif : il annonce ce qu'on trouvera
 * derrière, ce qui évite d'ouvrir trois onglets pour découvrir qu'il n'y avait qu'un produit.
 */
function CategoryTab({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  icon?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // `aria-pressed` et non `aria-selected` : ce sont des boutons de FILTRE, pas les onglets
      // d'un `tablist`. Annoncer un onglet promettrait un panneau qui n'existe pas.
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary font-medium text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {icon && <LayoutGrid className="size-3.5" aria-hidden />}
      {label}
      <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>
        {count}
      </span>
    </button>
  )
}
