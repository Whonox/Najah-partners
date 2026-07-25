import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Info } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/api/error"
import {
  memberQueryOptions,
  membersQueryOptions,
  type MemberListItem,
} from "@/api/queries/members"
import { useDecideVerification } from "@/api/queries/tasks"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { DataState } from "@/components/common/data-state"
import { Pagination, TableShell } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { IdDocumentViewer } from "@/pages/members/id-document-viewer"

const PAGE_SIZE = 20

/**
 * File de vérification d'identité (D-018, D-039) — le module en attente depuis la Tranche 4 :
 * le filtre de lecture existait, mais aucune route ne permettait de STATUER, si bien que la file
 * ne pouvait jamais se vider.
 *
 * ═══ L'INVARIANT EST ÉCRIT EN HAUT DE L'ÉCRAN, PAS SEULEMENT DANS LE CODE ═══
 * La vérification ne bloque RIEN. Un membre en attente ou refusé s'inscrit, s'active, perçoit ses
 * commissions et renouvelle exactement comme un membre vérifié. Sans cette phrase à l'écran, un
 * admin conclurait de la présence d'une « file d'attente » qu'il retient quelqu'un — et
 * traiterait dans l'urgence un dossier qui n'empêche rien.
 *
 * La file réutilise la liste des membres filtrée sur `PENDING` : c'est la même donnée, et un
 * second endpoint aurait fait deux définitions de « en attente » à garder d'accord.
 */
export function VerificationsPage() {
  const t = useT()
  const { hasRole } = useAuth()
  const canDecide = hasRole(["SUPER_ADMIN", "MANAGER"])

  const [page, setPage] = useState(1)
  const [reviewing, setReviewing] = useState<MemberListItem | null>(null)

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      verificationStatus: "PENDING" as const,
      sort: "registeredAt" as const,
      direction: "asc" as const,
    }),
    [page],
  )
  const members = useQuery(membersQueryOptions(query))

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("verifications.title")}
        description={t("verifications.description")}
      />

      <Alert>
        <Info />
        <AlertDescription>{t("verifications.nonBlocking")}</AlertDescription>
      </Alert>

      {!canDecide ? (
        <p className="text-xs text-muted-foreground">{t("verifications.restricted")}</p>
      ) : null}

      <DataState
        isLoading={members.isPending}
        error={members.error}
        isEmpty={members.data?.items.length === 0}
        onRetry={() => void members.refetch()}
        rows={8}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">
                  {t("verifications.column.code")}
                </TableHead>
                <TableHead>{t("verifications.column.name")}</TableHead>
                <TableHead className="w-40">
                  {t("verifications.column.registeredAt")}
                </TableHead>
                <TableHead className="w-28">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data?.items.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to={`/members/${member.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {member.memberCode}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {member.lastName} {member.firstName}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(member.registeredAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewing(member)}
                    >
                      {t("verifications.open")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {members.data?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("verifications.empty")}</p>
      ) : null}

      {members.data ? (
        <Pagination
          page={members.data.page}
          pageSize={members.data.pageSize}
          total={members.data.total}
          onPageChange={setPage}
        />
      ) : null}

      {reviewing ? (
        <ReviewDialog
          member={reviewing}
          canDecide={canDecide}
          onClose={() => setReviewing(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * Écran de traitement : l'IMAGE de la pièce à côté du NUMÉRO SAISI par le membre (D-039) et de
 * son identité déclarée. C'est tout l'intérêt du geste — l'admin compare trois choses qui doivent
 * concorder. Les mettre sur deux écrans séparés rendrait la comparaison impossible.
 *
 * La FICHE complète est chargée ici, à l'ouverture : le numéro de pièce et l'existence d'un
 * document n'appartiennent pas à la liste. Les y ajouter aurait alourdi chaque page de vingt
 * lignes pour un dossier qu'on ouvre un par un — et fait circuler des numéros de pièce dans une
 * réponse de liste.
 */
function ReviewDialog({
  member,
  canDecide,
  onClose,
}: {
  member: MemberListItem
  canDecide: boolean
  onClose: () => void
}) {
  const t = useT()
  const decide = useDecideVerification()
  const detail = useQuery(memberQueryOptions(member.id))
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null)

  function submit(status: "VERIFIED" | "REJECTED") {
    decide.mutate(
      {
        memberId: member.id,
        status,
        ...(status === "REJECTED" ? { reason: reason.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success(
            status === "VERIFIED"
              ? t("verifications.approved")
              : t("verifications.rejected"),
          )
          onClose()
        },
        onError: (error) => {
          toast.error(t("verifications.failed"), { description: errorMessage(error) })
          setConfirming(null)
        },
      },
    )
  }

  return (
    <>
      <Dialog
        open={confirming === null}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("verifications.reviewTitle")}</DialogTitle>
            <DialogDescription>{t("verifications.compareHint")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {t("verifications.declared")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Field label={t("verifications.column.code")}>
                  <span className="font-mono text-xs">{member.memberCode}</span>
                </Field>
                <Field label={t("verifications.column.name")}>
                  <span className="font-medium">
                    {member.lastName} {member.firstName}
                  </span>
                </Field>
                <Field label={t("verifications.column.registeredAt")}>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(member.registeredAt)}
                  </span>
                </Field>
                {detail.data?.idDocumentType ? (
                  <Field label={t("verifications.documentTitle")}>
                    <span className="text-xs">
                      {t(`idDocument.${detail.data.idDocumentType}`)}
                    </span>
                  </Field>
                ) : null}
                {/* Le NUMÉRO SAISI À LA MAIN : c'est lui que l'admin compare à l'image (D-039). */}
                <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {t("verifications.declaredNumber")}
                  </p>
                  <p className="font-mono text-lg">
                    {detail.data?.idDocumentNumber ?? (
                      <span className="text-sm text-muted-foreground">
                        {t("verifications.noNumber")}
                      </span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {t("verifications.documentTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detail.data ? (
                  detail.data.hasIdDocument ? (
                    <IdDocumentViewer memberId={member.id} hasDocument />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("verifications.noDocument")}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">{t("state.loading")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {rejecting ? (
            <div className="grid gap-1.5">
              <Label htmlFor="reject-reason">
                {t("verifications.rejectReason")}
              </Label>
              <Textarea
                id="reject-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("verifications.rejectReasonHint")}
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            {canDecide ? (
              <>
                {rejecting ? (
                  <Button
                    variant="destructive"
                    disabled={reason.trim().length < 3}
                    onClick={() => setConfirming("reject")}
                  >
                    {t("verifications.reject")}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setRejecting(true)}>
                    {t("verifications.reject")}
                  </Button>
                )}
                <Button onClick={() => setConfirming("approve")}>
                  {t("verifications.approve")}
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming === "approve"}
        title={t("verifications.approveTitle")}
        summary={`${member.memberCode} — ${member.lastName} ${member.firstName}`}
        consequence={t("verifications.approveConsequence")}
        confirmLabel={t("verifications.approve")}
        destructive={false}
        pending={decide.isPending}
        onConfirm={() => submit("VERIFIED")}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={confirming === "reject"}
        title={t("verifications.rejectTitle")}
        summary={
          <div className="space-y-1">
            <p>
              {member.memberCode} — {member.lastName} {member.firstName}
            </p>
            <p className="text-muted-foreground">{reason.trim()}</p>
          </div>
        }
        consequence={t("verifications.rejectConsequence")}
        confirmLabel={t("verifications.reject")}
        pending={decide.isPending}
        onConfirm={() => submit("REJECTED")}
        onCancel={() => setConfirming(null)}
      />
    </>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
