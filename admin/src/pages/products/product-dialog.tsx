import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/api/error"
import { PRODUCT_TYPES, type ProductType } from "@/api/enums"
import {
  useCreateProduct,
  useUpdateProduct,
  type Category,
  type Product,
} from "@/api/queries/catalog"
import { useT } from "@/i18n/use-t"
import type { TranslationKey } from "@/i18n/fr"

/**
 * Formulaire d'un produit (spec §7.2.5). Les validations rejouent celles du backend pour
 * placer l'erreur sur le bon champ — le serveur reste seul juge (`InvalidProductStockError`).
 *
 * Deux contrôles CROISÉS, qui sont les deux pièges du modèle :
 *  — le stock dépend du TYPE : obligatoire si PHYSIQUE, sans objet si VIRTUEL (illimité) ;
 *  — la promo est un prix en DINARS, donc bornée par le prix — et elle ne touche JAMAIS aux
 *    points (D-002) : il n'y a d'ailleurs pas de « promo en points » à saisir.
 */

/**
 * Un `<input type="number">` vidé rend `NaN` sur `valueAsNumber`. On l'accepte dans le schéma
 * et on le traite comme « non renseigné » — plutôt que par un `.transform()`, qui ferait
 * diverger le type d'ENTRÉE et de SORTIE du schéma et casserait le typage du resolver.
 */
const isBlank = (value: number | undefined) =>
  value === undefined || Number.isNaN(value)

const optionalNumber = z.union([z.number().nonnegative(), z.nan()]).optional()

function buildSchema(t: (key: TranslationKey) => string) {
  return z
    .object({
      name: z.string().trim().min(1, t("common.required")).max(160),
      description: z.string().max(4000).optional(),
      categoryId: z.number({ message: t("common.required") }).int().positive(),
      priceDt: z.number({ message: t("common.required") }).nonnegative(),
      // POINTS : entier strictement positif — il compose un palier, il ne peut pas être nul.
      valueBv: z
        .number({ message: t("packs.error.integer") })
        .int({ message: t("packs.error.integer") })
        .positive({ message: t("packs.error.positive") }),
      type: z.enum(PRODUCT_TYPES),
      stock: z.union([z.number().int().nonnegative(), z.nan()]).optional(),
      shippingFeeDt: optionalNumber,
      promoPriceDt: optionalNumber,
      active: z.boolean(),
      visibleOnSite: z.boolean(),
    })
    // Le stock dépend du TYPE : obligatoire si PHYSIQUE (0 = rupture), sans objet si VIRTUEL.
    .refine((v) => v.type === "VIRTUAL" || !isBlank(v.stock), {
      message: t("products.error.stockRequired"),
      path: ["stock"],
    })
    // La promo est un PRIX (dinars), donc bornée par le prix. Elle ne touche jamais aux points.
    .refine((v) => isBlank(v.promoPriceDt) || v.promoPriceDt! <= v.priceDt, {
      message: t("products.error.promoAbovePrice"),
      path: ["promoPriceDt"],
    })
}

type ProductForm = z.infer<ReturnType<typeof buildSchema>>

export function ProductDialog({
  product,
  categories,
  onClose,
}: {
  product?: Product
  categories: Category[]
  onClose: () => void
}) {
  const t = useT()
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const isEdit = product !== undefined

  const form = useForm<ProductForm>({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      categoryId: product?.categoryId ?? categories[0]?.id ?? 0,
      priceDt: product ? Number(product.priceDt) : 0,
      valueBv: product?.valueBv ?? 1,
      type: (product?.type ?? "PHYSICAL") as ProductType,
      stock: product?.stock ?? undefined,
      shippingFeeDt: product ? Number(product.shippingFeeDt) : 0,
      promoPriceDt: product?.promoPriceDt ? Number(product.promoPriceDt) : undefined,
      active: product?.active ?? true,
      visibleOnSite: product?.visibleOnSite ?? true,
    },
  })

  // `useWatch` et non `form.watch` : le React Compiler ne sait pas mémoïser la seconde
  // (elle renvoie une fonction non stable) et renonce alors à optimiser tout le composant.
  const type = useWatch({ control: form.control, name: "type" })
  const pending = create.isPending || update.isPending

  function submit(values: ProductForm) {
    const body = {
      name: values.name,
      description: values.description || undefined,
      categoryId: values.categoryId,
      priceDt: values.priceDt,
      valueBv: values.valueBv,
      type: values.type,
      // VIRTUEL : le champ n'est pas envoyé du tout (le backend refuse un stock sur un
      // produit virtuel — `null` y signifie « sans objet », pas « zéro »).
      ...(values.type === "PHYSICAL" && !isBlank(values.stock)
        ? { stock: values.stock }
        : {}),
      shippingFeeDt: isBlank(values.shippingFeeDt) ? 0 : values.shippingFeeDt,
      ...(isBlank(values.promoPriceDt)
        ? {}
        : { promoPriceDt: values.promoPriceDt }),
      active: values.active,
      visibleOnSite: values.visibleOnSite,
    }

    const done = {
      onSuccess: () => {
        toast.success(t("common.saved"))
        onClose()
      },
      onError: (error: unknown) =>
        toast.error(t("common.saveFailed"), { description: errorMessage(error) }),
    }

    if (isEdit) {
      update.mutate({ id: product.id, body }, done)
    } else {
      create.mutate(body, done)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(isEdit ? "products.edit" : "products.new")}</DialogTitle>
          <DialogDescription>{t("products.hint.twoUnits")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.field.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.field.description")}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.category")}</FormLabel>
                    <Select
                      value={field.value ? String(field.value) : ""}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.type")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRODUCT_TYPES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(`products.type.${value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* LE champ en POINTS, isolé des montants : entier, et sa phrase dit à quoi il sert. */}
            <FormField
              control={form.control}
              name="valueBv"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.field.points")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormDescription>{t("products.hint.twoUnits")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Les trois champs de DINARS, groupés. Aucun ne modifie les points ci-dessus. */}
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="priceDt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.price")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="tabular-nums"
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="promoPriceDt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.promo")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="tabular-nums"
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(
                            event.target.value === ""
                              ? undefined
                              : event.target.valueAsNumber,
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>{t("products.hint.promo")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="shippingFeeDt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.shipping")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="tabular-nums"
                        value={field.value ?? 0}
                        onChange={(event) => field.onChange(event.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>{t("products.hint.shipping")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Le stock N'EXISTE QUE pour un produit physique : afficher un champ grisé
                laisserait croire qu'un produit virtuel a un stock « à zéro ». */}
            {type === "PHYSICAL" ? (
              <FormField
                control={form.control}
                name="stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.field.stock")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(
                            event.target.value === ""
                              ? undefined
                              : event.target.valueAsNumber,
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>{t("products.hint.stock")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                {t("products.hint.stock")}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
                    <FormLabel>{t("products.field.active")}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="visibleOnSite"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
                    <FormLabel>{t("products.field.visible")}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t(pending ? "common.saving" : "common.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
