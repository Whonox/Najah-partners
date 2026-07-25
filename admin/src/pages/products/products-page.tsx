import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Info, Pencil, Plus } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectOptions,
  SelectTrigger,
  SelectValue,
  type SelectOption,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  categoriesQueryOptions,
  productsQueryOptions,
  type Product,
} from "@/api/queries/catalog"
import { DataState } from "@/components/common/data-state"
import { FilterBar, FilterField, TableShell } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import { ActiveBadge } from "@/components/common/status-badge"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { useAuth } from "@/auth/use-auth"
import { useT } from "@/i18n/use-t"
import { CategoriesTab } from "./categories-tab"
import { ProductDialog } from "./product-dialog"

const ANY = "__any__"

/**
 * Produits et catégories (spec §7.2.5).
 *
 * La table met en regard les DEUX dimensions d'un produit, sans jamais les mélanger (D-028) :
 * la colonne « Points » est entière et alignée à gauche, les colonnes d'argent sont à
 * 3 décimales et alignées à droite. C'est aussi ce que dit l'encart en tête : la valeur en
 * points compose le palier d'un pack, la promotion baisse le prix sans y toucher.
 *
 * Aucun bouton de suppression : une `OrderLine` référence un produit à vie. On le désactive.
 */
export function ProductsPage() {
  const t = useT()
  const { hasRole } = useAuth()
  const canEdit = hasRole(["SUPER_ADMIN", "MANAGER"])

  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [editing, setEditing] = useState<Product | null>(null)
  const [creating, setCreating] = useState(false)

  const products = useQuery(productsQueryOptions(categoryId))
  const categories = useQuery(categoriesQueryOptions)

  const categoryName = (id: number) =>
    categories.data?.find((category) => category.id === id)?.name ??
    t("common.none")

  // `ANY` porte un LIBELLÉ comme n'importe quelle autre option : c'est ce qui empêche
  // « __any__ » d'apparaître dans le déclencheur quand aucun filtre n'est posé.
  const categoryOptions: SelectOption[] = [
    { value: ANY, label: t("products.filter.categoryAll") },
    ...(categories.data ?? []).map((category) => ({
      value: String(category.id),
      label: category.name,
    })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("products.title")}
        description={t("products.description")}
      />

      {/* Le rappel exigé à l'écran : à quoi servent les points, et ce qu'une promo NE touche pas. */}
      <Alert>
        <Info />
        <AlertDescription>{t("products.hint.twoUnits")}</AlertDescription>
      </Alert>

      {!canEdit ? (
        <Alert>
          <AlertDescription>{t("products.readOnly")}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">{t("products.tab.products")}</TabsTrigger>
          <TabsTrigger value="categories">
            {t("products.tab.categories")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <FilterBar>
              <FilterField label={t("products.filter.category")} className="w-56">
                <Select
                  options={categoryOptions}
                  value={categoryId ? String(categoryId) : ANY}
                  onValueChange={(value) =>
                    setCategoryId(value === ANY ? undefined : Number(value))
                  }
                >
                  <SelectTrigger aria-label={t("products.filter.category")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectOptions options={categoryOptions} />
                  </SelectContent>
                </Select>
              </FilterField>
            </FilterBar>
            {canEdit ? (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                {t("products.new")}
              </Button>
            ) : null}
          </div>

          <DataState
            isLoading={products.isPending}
            error={products.error}
            isEmpty={products.data?.length === 0}
            onRetry={() => void products.refetch()}
            rows={8}
          >
            <TableShell>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("products.column.name")}</TableHead>
                    <TableHead className="w-40">
                      {t("products.column.category")}
                    </TableHead>
                    <TableHead className="w-32 text-end">
                      {t("products.column.price")}
                    </TableHead>
                    <TableHead className="w-32 text-end">
                      {t("products.column.promo")}
                    </TableHead>
                    {/* Colonne de POINTS : entière, jamais alignée avec les colonnes d'argent. */}
                    <TableHead className="w-28">
                      {t("products.column.points")}
                    </TableHead>
                    <TableHead className="w-24">
                      {t("products.column.type")}
                    </TableHead>
                    <TableHead className="w-24">
                      {t("products.column.stock")}
                    </TableHead>
                    <TableHead className="w-32 text-end">
                      {t("products.column.shipping")}
                    </TableHead>
                    <TableHead className="w-24">
                      {t("products.column.status")}
                    </TableHead>
                    <TableHead className="w-24">
                      {t("products.column.visible")}
                    </TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.data?.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {categoryName(product.categoryId)}
                      </TableCell>
                      <TableCell className="text-end">
                        <MoneyDt value={product.priceDt} />
                      </TableCell>
                      <TableCell className="text-end">
                        {product.promoPriceDt ? (
                          <MoneyDt value={product.promoPriceDt} />
                        ) : (
                          <span className="text-muted-foreground">
                            {t("common.none")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <PointsBv value={product.valueBv} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(`products.type.${product.type}`)}
                      </TableCell>
                      {/* `null` ne veut pas dire « inconnu » mais « sans objet » : un produit
                          VIRTUEL est illimité. On l'écrit, on ne laisse pas une case vide. */}
                      <TableCell className="tabular-nums">
                        {product.stock === null || product.stock === undefined ? (
                          <span className="text-muted-foreground italic">
                            {t("products.stockUnlimited")}
                          </span>
                        ) : (
                          product.stock
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <MoneyDt value={product.shippingFeeDt} />
                      </TableCell>
                      <TableCell>
                        <ActiveBadge active={product.active} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(product.visibleOnSite ? "common.yes" : "common.no")}
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(product)}
                            >
                              <Pencil />
                              {t("common.edit")}
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableShell>
          </DataState>

          <p className="text-xs text-muted-foreground">
            {t("products.hint.shipping")}
          </p>
        </TabsContent>

        <TabsContent value="categories">
          <CategoriesTab canEdit={canEdit} />
        </TabsContent>
      </Tabs>

      {creating ? (
        <ProductDialog
          categories={categories.data ?? []}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <ProductDialog
          product={editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
