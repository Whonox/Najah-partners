import { useQuery } from "@tanstack/react-query"
import { Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { adminSessionsQueryOptions, type AdminUser } from "@/api/queries/admin-users"
import { DataState } from "@/components/common/data-state"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * « Journal de connexion » (§7.2.12) — et il faut être précis sur ce que c'est.
 *
 * Rien, en base, n'enregistre les TENTATIVES de connexion. Ce qui existe, ce sont les jetons de
 * rafraîchissement (D-016) : chaque ouverture de session crée une famille de jetons, avec sa
 * date, son IP et son navigateur, et chaque rotation en ajoute un. On en reconstitue donc les
 * SESSIONS RÉUSSIES — de la donnée réellement écrite, pas un journal inventé.
 *
 * Ce qui manque est dit à l'écran plutôt que passé sous silence : les ÉCHECS de connexion n'y
 * sont pas, et une liste vide ne signifie donc pas « aucune tentative ». Les journaliser
 * demanderait une table dédiée et une écriture dans le chemin d'authentification — point ouvert.
 */
export function AdminSessionsDialog({
  admin,
  onClose,
}: {
  admin: AdminUser
  onClose: () => void
}) {
  const t = useT()
  const query = useQuery(adminSessionsQueryOptions(admin.id))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("adminUsers.sessionsTitle")}</DialogTitle>
          <DialogDescription>
            {admin.name} — {t("adminUsers.sessionsDescription")}
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info />
          <AlertDescription>{t("adminUsers.sessionsIncomplete")}</AlertDescription>
        </Alert>

        <DataState
          isLoading={query.isPending}
          error={query.error}
          isEmpty={query.data?.sessions.length === 0}
          onRetry={() => void query.refetch()}
          rows={4}
        >
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">
                    {t("adminUsers.sessionColumn.started")}
                  </TableHead>
                  <TableHead className="w-40">
                    {t("adminUsers.sessionColumn.lastSeen")}
                  </TableHead>
                  <TableHead className="w-36">
                    {t("adminUsers.sessionColumn.ip")}
                  </TableHead>
                  <TableHead>{t("adminUsers.sessionColumn.agent")}</TableHead>
                  <TableHead className="w-28">
                    {t("adminUsers.sessionColumn.state")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data?.sessions.map((session) => (
                  <TableRow key={session.familyId}>
                    <TableCell className="text-xs">
                      {formatDateTime(session.startedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(session.lastSeenAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {session.ip ?? t("adminUsers.unknownIp")}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                      {session.userAgent ?? t("adminUsers.unknownAgent")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={session.current ? "default" : "outline"}>
                        {session.current
                          ? t("adminUsers.sessionCurrent")
                          : t("adminUsers.sessionClosed")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DataState>

        {query.data?.sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("adminUsers.sessionsEmpty")}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
