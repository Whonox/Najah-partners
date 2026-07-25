import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Pencil, Plus } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { packsQueryOptions, type Pack } from "@/api/queries/packs"
import { DataState } from "@/components/common/data-state"
import { TableShell } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import { ActiveBadge } from "@/components/common/status-badge"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { useAuth } from "@/auth/use-auth"
import { useT } from "@/i18n/use-t"
import { PackDialog } from "./pack-dialog"

/**
 * Packs (spec §7.2.4). Deux invariants qui doivent se LIRE à l'écran, pas seulement tenir
 * dans le code :
 *
 *  1. **Aucune suppression.** Il n'y a pas de bouton, et il n'y a pas non plus de route
 *     backend : l'historique des activations dépend des packs. On désactive.
 *  2. **Modifier n'affecte que l'avenir.** L'avertissement est permanent, en tête d'écran, et
 *     répété dans le formulaire : c'est la seule chose que l'utilisateur doit comprendre
 *     avant de toucher à une commission.
 *
 * RBAC (D-043) : les trois rôles lisent, seul un SUPER_ADMIN écrit — un pack définit des
 * montants de commission. Le front masque, le backend autorise (403 si l'on force).
 */
export function PacksPage() {
  const t = useT()
  const { hasRole } = useAuth()
  const canEdit = hasRole(["SUPER_ADMIN"])

  const query = useQuery(packsQueryOptions)
  const [editing, setEditing] = useState<Pack | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("packs.title")}
        description={t("packs.description")}
        actions={
          canEdit ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t("packs.new")}
            </Button>
          ) : null
        }
      />

      {/* L'avertissement de SNAPSHOT (spec §5.8) — permanent, pas au moment de valider :
          l'utilisateur doit le lire AVANT de décider de modifier, pas après. */}
      <Alert>
        <AlertTriangle />
        <AlertTitle>{t("packs.warningTitle")}</AlertTitle>
        <AlertDescription>{t("packs.warning")}</AlertDescription>
      </Alert>

      {!canEdit ? (
        <Alert>
          <AlertDescription>{t("packs.readOnly")}</AlertDescription>
        </Alert>
      ) : null}

      <DataState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.length === 0}
        onRetry={() => void query.refetch()}
        rows={4}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("packs.column.name")}</TableHead>
                {/* POINTS d'un côté… */}
                <TableHead className="w-28">{t("packs.column.tier")}</TableHead>
                {/* …DINARS de l'autre : quatre colonnes d'argent, toutes alignées à droite. */}
                <TableHead className="w-36 text-end">
                  {t("packs.column.price")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("packs.column.direct")}
                </TableHead>
                <TableHead className="w-36 text-end">
                  {t("packs.column.indirect")}
                </TableHead>
                <TableHead className="w-40 text-end">
                  {t("packs.column.cap")}
                </TableHead>
                <TableHead className="w-24">
                  {t("packs.column.members")}
                </TableHead>
                <TableHead className="w-24">{t("packs.column.status")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.map((pack) => (
                <TableRow key={pack.id}>
                  <TableCell className="font-medium">{pack.name}</TableCell>
                  <TableCell>
                    <PointsBv value={pack.tierBv} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={pack.priceDt} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={pack.directCommissionDt} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={pack.indirectCommissionDt} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={pack.weeklyCapDt} />
                  </TableCell>
                  {/* Le nombre de membres est là pour rendre l'invariant TANGIBLE : ces
                      membres portent un snapshot que rien de cet écran ne réécrira. */}
                  <TableCell
                    className="tabular-nums text-muted-foreground"
                    title={t("packs.membersHint")}
                  >
                    {pack.memberCount}
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={pack.active} />
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(pack)}
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

      {/* Aucun bouton « Supprimer » : voir l'en-tête du fichier. */}
      <p className="text-xs text-muted-foreground">{t("packs.hint.noDelete")}</p>

      {creating ? <PackDialog onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <PackDialog pack={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}
