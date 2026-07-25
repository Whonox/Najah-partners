import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Pencil, Plus, Trash2 } from "lucide-react"
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { errorMessage } from "@/api/error"
import {
  categoriesQueryOptions,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  type Category,
} from "@/api/queries/catalog"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { DataState } from "@/components/common/data-state"
import { TableShell } from "@/components/common/data-table"
import { useT } from "@/i18n/use-t"
import type { TranslationKey } from "@/i18n/fr"

/**
 * Catégories (spec §7.2.5). Seul endroit du back-office où une SUPPRESSION existe — et
 * seulement parce qu'une catégorie VIDE ne porte aucun historique. Le backend refuse toute
 * catégorie encore peuplée : on ne pré-vérifie donc pas ici, on affiche son refus.
 */
export function CategoriesTab({ canEdit }: { canEdit: boolean }) {
  const t = useT()
  const query = useQuery(categoriesQueryOptions)
  const [editing, setEditing] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const remove = useDeleteCategory()

  /**
   * Confirmation THÉMÉE (Tranche 8c) et non plus `window.confirm` : ce dernier ne suit pas le
   * thème, ne se traduit pas, et ne peut pas RÉCAPITULER ce qu'on s'apprête à supprimer — alors
   * que le nom de la catégorie est justement ce qu'on veut relire avant de valider.
   */
  function confirmDelete() {
    if (!deleting) return
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(t("categories.deleted"))
        setDeleting(null)
      },
      onError: (error) => {
        toast.error(t("common.saveFailed"), { description: errorMessage(error) })
        setDeleting(null)
      },
    })
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("categories.new")}
          </Button>
        </div>
      ) : null}

      <DataState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.length === 0}
        onRetry={() => void query.refetch()}
        rows={5}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-56">
                  {t("categories.column.name")}
                </TableHead>
                <TableHead>{t("categories.column.description")}</TableHead>
                <TableHead className="w-24">
                  {t("categories.column.sortOrder")}
                </TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {category.description ?? t("common.none")}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {category.sortOrder}
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("common.edit")}
                          onClick={() => setEditing(category)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("common.delete")}
                          disabled={remove.isPending}
                          onClick={() => setDeleting(category)}
                        >
                          <Trash2 />
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

      {creating ? <CategoryDialog onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <CategoryDialog category={editing} onClose={() => setEditing(null)} />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={t("categories.deleteTitle")}
        summary={deleting?.name}
        consequence={t("categories.deleteBody")}
        confirmLabel={t("common.delete")}
        pending={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

function buildSchema(t: (key: TranslationKey) => string) {
  return z.object({
    name: z.string().trim().min(1, t("common.required")).max(80),
    description: z.string().max(2000).optional(),
    sortOrder: z.number().int().nonnegative(),
  })
}

type CategoryForm = z.infer<ReturnType<typeof buildSchema>>

function CategoryDialog({
  category,
  onClose,
}: {
  category?: Category
  onClose: () => void
}) {
  const t = useT()
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const isEdit = category !== undefined

  const form = useForm<CategoryForm>({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
      sortOrder: category?.sortOrder ?? 0,
    },
  })

  const pending = create.isPending || update.isPending

  function submit(values: CategoryForm) {
    const body = {
      name: values.name,
      description: values.description || undefined,
      sortOrder: values.sortOrder,
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
      update.mutate({ id: category.id, body }, done)
    } else {
      create.mutate(body, done)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(isEdit ? "categories.edit" : "categories.new")}
          </DialogTitle>
          <DialogDescription>{t("categories.dialogHint")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("categories.field.name")}</FormLabel>
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
                  <FormLabel>{t("categories.field.description")}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("categories.field.sortOrder")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
