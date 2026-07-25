import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Info, KeyRound, Pencil, Plus, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  adminUsersQueryOptions,
  useUpdateAdminUser,
  type AdminUser,
} from "@/api/queries/admin-users"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { DataState } from "@/components/common/data-state"
import { TableShell } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import { ActiveBadge } from "@/components/common/status-badge"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { AdminUserDialog, ResetPasswordDialog } from "./admin-user-dialogs"
import { AdminSessionsDialog } from "./admin-sessions-dialog"

/**
 * Comptes admin & rôles (spec §7.2.12) — écran réservé au SUPER_ADMIN, garde posée sur la route.
 *
 * TROIS PARTIS PRIS, tous écrits à l'écran plutôt que laissés à deviner :
 *
 *  1. **aucune matrice de permissions.** §7.2.12 parle de « permissions par module », mais les
 *     rôles sont un enum et les droits vivent dans les guards du backend : rendre cela éditable
 *     serait refondre le modèle d'autorisation. Question non tranchée avec la cliente → rien
 *     d'inventé, et un encadré le dit ;
 *  2. **aucune suppression.** Un compte reste référencé à vie par ce qu'il a validé
 *     (renouvellements, e-cards de genèse, vérifications d'identité). On désactive — la trace de
 *     qui a fait quoi doit survivre au départ de la personne ;
 *  3. **on ne se coupe pas l'accès à soi-même.** Les actions dangereuses sur son propre compte
 *     sont masquées ici, et refusées par le backend — y compris le retrait du dernier super-admin.
 */
export function AdminUsersPage() {
  const t = useT()
  const { admin } = useAuth()
  const query = useQuery(adminUsersQueryOptions)
  const update = useUpdateAdminUser()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [resetting, setResetting] = useState<AdminUser | null>(null)
  const [sessionsOf, setSessionsOf] = useState<AdminUser | null>(null)
  const [toggling, setToggling] = useState<AdminUser | null>(null)

  function toggleActive(target: AdminUser) {
    update.mutate(
      { id: target.id, body: { active: !target.active } },
      {
        onSuccess: () => {
          toast.success(t("adminUsers.updated"))
          setToggling(null)
        },
        onError: (error) => {
          toast.error(t("adminUsers.saveFailed"), { description: errorMessage(error) })
          setToggling(null)
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("adminUsers.title")}
        description={t("adminUsers.description")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("adminUsers.new")}
          </Button>
        }
      />

      <Alert>
        <ShieldCheck />
        <AlertDescription>{t("adminUsers.rolesFixed")}</AlertDescription>
      </Alert>

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
                <TableHead>{t("adminUsers.column.name")}</TableHead>
                <TableHead>{t("adminUsers.column.email")}</TableHead>
                <TableHead className="w-32">{t("adminUsers.column.role")}</TableHead>
                <TableHead className="w-24">{t("adminUsers.column.state")}</TableHead>
                <TableHead className="w-40">
                  {t("adminUsers.column.lastLogin")}
                </TableHead>
                <TableHead className="w-28 text-end">
                  {t("adminUsers.column.sessions")}
                </TableHead>
                <TableHead className="w-72">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.map((row) => {
                const isSelf = row.id === admin?.id
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.name}
                      {isSelf ? (
                        <span className="ms-2 text-xs text-muted-foreground">
                          ({t("session.account")})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.email}</TableCell>
                    <TableCell>
                      <Badge variant={row.role === "SUPER_ADMIN" ? "default" : "outline"}>
                        {t(`role.${row.role}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ActiveBadge active={row.active} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastLoginAt
                        ? formatDateTime(row.lastLoginAt)
                        : t("adminUsers.neverConnected")}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {row.activeSessionCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(row)}
                        >
                          <Pencil />
                          {t("common.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setResetting(row)}
                        >
                          <KeyRound />
                          {t("adminUsers.resetPassword")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSessionsOf(row)}
                        >
                          {t("adminUsers.sessionsOpen")}
                        </Button>
                        {/* Se désactiver soi-même couperait l'accès au module qui aurait permis
                            de revenir en arrière : le bouton n'existe pas sur sa propre ligne. */}
                        {isSelf ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setToggling(row)}
                          >
                            {row.active
                              ? t("adminUsers.deactivateConfirm")
                              : t("adminUsers.reactivateConfirm")}
                          </Button>
                        )}
                      </div>
                      {isSelf ? (
                        <p className="text-xs text-muted-foreground">
                          {t("adminUsers.selfHint")}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {query.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("adminUsers.empty")}</p>
      ) : null}

      <Alert>
        <Info />
        <AlertDescription>{t("adminUsers.noDelete")}</AlertDescription>
      </Alert>

      {creating ? <AdminUserDialog onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <AdminUserDialog admin={editing} onClose={() => setEditing(null)} />
      ) : null}
      {resetting ? (
        <ResetPasswordDialog admin={resetting} onClose={() => setResetting(null)} />
      ) : null}
      {sessionsOf ? (
        <AdminSessionsDialog
          admin={sessionsOf}
          onClose={() => setSessionsOf(null)}
        />
      ) : null}

      <ConfirmDialog
        open={toggling !== null}
        title={
          toggling?.active
            ? t("adminUsers.deactivateTitle")
            : t("adminUsers.reactivateTitle")
        }
        summary={toggling ? `${toggling.name} — ${toggling.email}` : null}
        consequence={
          toggling?.active
            ? t("adminUsers.deactivateConsequence")
            : t("adminUsers.reactivateConsequence")
        }
        confirmLabel={
          toggling?.active
            ? t("adminUsers.deactivateConfirm")
            : t("adminUsers.reactivateConfirm")
        }
        destructive={toggling?.active ?? false}
        pending={update.isPending}
        onConfirm={() => toggling && toggleActive(toggling)}
        onCancel={() => setToggling(null)}
      />
    </div>
  )
}
