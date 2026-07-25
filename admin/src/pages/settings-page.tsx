import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Pencil, X } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { errorMessage } from "@/api/error"
import { settingsQueryOptions, useUpdateSetting, type Setting } from "@/api/queries/settings"
import { DataState } from "@/components/common/data-state"
import { PageHeader } from "@/components/common/page-header"
import { useAuth } from "@/auth/use-auth"
import { useT } from "@/i18n/use-t"
import type { TranslationKey } from "@/i18n/fr"

/**
 * Paramètres système (spec §7.2.11) — premier écran branché de bout en bout : API → client
 * généré → affichage → mutation → RBAC.
 *
 * Aucune interprétation des valeurs ici : une valeur est une CHAÎNE, le backend et lui seul
 * sait ce que « 180 », « FRIDAY » ou « 100 » signifient pour leur clé. Le back-office affiche
 * et déclenche ; il ne calcule pas (CLAUDE.md racine).
 */
export function SettingsPage() {
  const t = useT()
  const { hasRole } = useAuth()
  const canEdit = hasRole(["SUPER_ADMIN"]) // le backend refuse de toute façon les autres rôles

  const query = useQuery(settingsQueryOptions)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      {!canEdit ? (
        <Alert>
          <AlertDescription>{t("settings.readOnly")}</AlertDescription>
        </Alert>
      ) : null}

      <DataState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.length === 0}
        onRetry={() => void query.refetch()}
        rows={8}
      >
        <Card className="p-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-64">{t("settings.column.label")}</TableHead>
                  <TableHead>{t("settings.column.description")}</TableHead>
                  <TableHead className="w-48">{t("settings.column.value")}</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data?.map((setting) => (
                  <SettingRow
                    key={setting.key}
                    setting={setting}
                    canEdit={canEdit}
                    isEditing={editingKey === setting.key}
                    onEdit={() => setEditingKey(setting.key)}
                    onDone={() => setEditingKey(null)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </DataState>
    </div>
  )
}

function SettingRow({
  setting,
  canEdit,
  isEditing,
  onEdit,
  onDone,
}: {
  setting: Setting
  canEdit: boolean
  isEditing: boolean
  onEdit: () => void
  onDone: () => void
}) {
  const t = useT()
  const [value, setValue] = useState(setting.value)
  const mutation = useUpdateSetting()

  function save() {
    mutation.mutate(
      { key: setting.key, value },
      {
        onSuccess: () => {
          toast.success(t("settings.saved"))
          onDone()
        },
        onError: (error) =>
          toast.error(t("settings.saveFailed"), { description: errorMessage(error) }),
      },
    )
  }

  function cancel() {
    setValue(setting.value)
    onDone()
  }

  /**
   * La clé technique reste — c'est elle qui IDENTIFIE le paramètre, et l'admin la retrouve
   * dans une consigne ou un échange avec l'équipe. Mais elle ne se lit pas : on la surmonte
   * d'un libellé en français.
   *
   * Le libellé vit dans le dictionnaire d'interface et non en base : c'est du texte d'écran,
   * traduisible le jour où l'arabe arrive, là où une colonne figerait le français dans les
   * données. La clé d'un paramètre venant de la BASE, elle n'est pas connue à la compilation :
   * on interroge le dictionnaire de façon tolérante — `t` rend la clé elle-même quand elle est
   * absente, ce qui donne le repli « pas de libellé » sans jamais casser l'écran.
   */
  const labelKey = `settings.label.${setting.key}` as TranslationKey
  const label = t(labelKey)
  const hasLabel = label !== labelKey

  return (
    <TableRow>
      <TableCell>
        {hasLabel ? (
          <span className="block font-medium">{label}</span>
        ) : null}
        <span className="font-mono text-xs text-muted-foreground">
          {setting.key}
        </span>
      </TableCell>
      {/* `whitespace-normal` : les cellules shadcn sont en `nowrap` par défaut, ce qui pousserait
          la colonne d'actions hors de l'écran sur une description un peu longue. */}
      <TableCell className="whitespace-normal text-muted-foreground">
        {setting.description ?? t("settings.noDescription")}
      </TableCell>
      <TableCell>
        {isEditing ? (
          <Input
            aria-label={t("settings.valueLabel")}
            value={value}
            autoFocus
            disabled={mutation.isPending}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save()
              if (event.key === "Escape") cancel()
            }}
          />
        ) : (
          <span className="font-medium">{setting.value}</span>
        )}
      </TableCell>
      <TableCell>
        {isEditing ? (
          <div className="flex justify-end gap-1">
            <Button
              size="icon-sm"
              aria-label={t("settings.save")}
              disabled={mutation.isPending || value === setting.value}
              onClick={save}
            >
              <Check />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("settings.cancel")}
              disabled={mutation.isPending}
              onClick={cancel}
            >
              <X />
            </Button>
          </div>
        ) : canEdit ? (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil />
              {t("settings.edit")}
            </Button>
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  )
}
