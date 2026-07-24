import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Switch } from "@/components/ui/switch"
import { errorMessage } from "@/api/error"
import { useCreatePack, useUpdatePack, type Pack } from "@/api/queries/packs"
import { useT } from "@/i18n/use-t"
import type { TranslationKey } from "@/i18n/fr"

/**
 * Formulaire d'un pack (spec §7.2.4).
 *
 * Les validations reprennent CELLES DU BACKEND — elles ne les remplacent pas : le serveur
 * refuse de toute façon un plafond sous une commission (`WeeklyCapBelowCommissionError`).
 * Les rejouer ici sert uniquement à donner l'erreur au bon champ, avant l'aller-retour. Rien
 * ici n'est une règle métier propre au front : la vérité reste côté serveur (CLAUDE.md).
 */

/** Les montants sont saisis en DT et envoyés en `number` : c'est ce que le DTO backend attend. */
const millime = (message: string) =>
  z
    .number({ message })
    .positive({ message })
    .refine((value) => Number.isInteger(Math.round(value * 1000)), { message })

function buildSchema(t: (key: TranslationKey) => string) {
  return z
    .object({
      name: z.string().trim().min(1, t("common.required")).max(60),
      // POINTS : un ENTIER. C'est la première chose qui distingue ce champ des cinq autres.
      tierBv: z
        .number({ message: t("packs.error.integer") })
        .int({ message: t("packs.error.integer") })
        .positive({ message: t("packs.error.positive") }),
      priceDt: millime(t("packs.error.positive")),
      directCommissionDt: millime(t("packs.error.positive")),
      indirectCommissionDt: millime(t("packs.error.positive")),
      weeklyCapDt: millime(t("packs.error.positive")),
      active: z.boolean(),
    })
    // Contrôle CROISÉ (spec §7.2.4) : un plafond sous une commission rendrait cette
    // commission impayable en entier, pas même la première de la semaine.
    .refine((v) => v.weeklyCapDt >= v.directCommissionDt, {
      message: t("packs.error.capBelowCommission"),
      path: ["weeklyCapDt"],
    })
    .refine((v) => v.weeklyCapDt >= v.indirectCommissionDt, {
      message: t("packs.error.capBelowCommission"),
      path: ["weeklyCapDt"],
    })
}

type PackForm = z.infer<ReturnType<typeof buildSchema>>

export function PackDialog({
  pack,
  onClose,
}: {
  /** Absent = création. */
  pack?: Pack
  onClose: () => void
}) {
  const t = useT()
  const create = useCreatePack()
  const update = useUpdatePack()
  const isEdit = pack !== undefined

  const form = useForm<PackForm>({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: {
      name: pack?.name ?? "",
      tierBv: pack?.tierBv ?? 1000,
      // Les montants arrivent en CHAÎNE (précision au millime préservée sur le fil) et
      // repartent en `number` : `Number()` est sûr ici, une valeur à 3 décimales tient
      // exactement dans un double.
      priceDt: pack ? Number(pack.priceDt) : 0,
      directCommissionDt: pack ? Number(pack.directCommissionDt) : 0,
      indirectCommissionDt: pack ? Number(pack.indirectCommissionDt) : 0,
      weeklyCapDt: pack ? Number(pack.weeklyCapDt) : 0,
      active: pack?.active ?? true,
    },
  })

  const pending = create.isPending || update.isPending

  function submit(values: PackForm) {
    const done = {
      onSuccess: () => {
        toast.success(t("common.saved"))
        onClose()
      },
      onError: (error: unknown) =>
        toast.error(t("common.saveFailed"), { description: errorMessage(error) }),
    }

    if (isEdit) {
      update.mutate({ id: pack.id, body: values }, done)
    } else {
      create.mutate(values, done)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(isEdit ? "packs.edit" : "packs.new")}</DialogTitle>
          <DialogDescription>{t("packs.description")}</DialogDescription>
        </DialogHeader>

        {/* Rappelé ICI aussi : c'est au moment de modifier qu'on doute, pas en lisant la liste. */}
        {isEdit ? (
          <Alert>
            <AlertTriangle />
            <AlertDescription>{t("packs.warning")}</AlertDescription>
          </Alert>
        ) : null}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="grid gap-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("packs.field.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* LE champ en POINTS. Isolé, avec son propre pas (entier) et sa propre phrase :
                c'est le seul de ce formulaire qui ne soit pas de l'argent (D-028). */}
            <FormField
              control={form.control}
              name="tierBv"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("packs.field.tier")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormDescription>{t("packs.hint.tier")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField
                form={form}
                name="priceDt"
                label={t("packs.field.price")}
                description={t("packs.hint.price")}
              />
              <MoneyField
                form={form}
                name="weeklyCapDt"
                label={t("packs.field.cap")}
                description={t("packs.hint.cap")}
              />
              <MoneyField
                form={form}
                name="directCommissionDt"
                label={t("packs.field.direct")}
              />
              <MoneyField
                form={form}
                name="indirectCommissionDt"
                label={t("packs.field.indirect")}
              />
            </div>

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t("packs.field.active")}</FormLabel>
                    <FormDescription>{t("packs.hint.noDelete")}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={pending}
              >
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

/** Un champ de DINARS : pas au millime, saisie décimale. Quatre occurrences, un seul gabarit. */
function MoneyField({
  form,
  name,
  label,
  description,
}: {
  form: ReturnType<typeof useForm<PackForm>>
  name: "priceDt" | "directCommissionDt" | "indirectCommissionDt" | "weeklyCapDt"
  label: string
  description?: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
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
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
