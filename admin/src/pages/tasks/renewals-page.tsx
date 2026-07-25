import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { AlertTriangle, Info } from "lucide-react"
import { toast } from "sonner"
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
import { errorMessage } from "@/api/error"
import {
  pendingRenewalsQueryOptions,
  useValidateRenewal,
  type PendingRenewal,
} from "@/api/queries/tasks"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { DataState } from "@/components/common/data-state"
import { TableShell } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/page-header"
import { MemberStatusBadge } from "@/components/common/status-badge"
import { MoneyDt } from "@/components/format/amount"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * File de validation des renouvellements (D-038) — le circuit existait depuis la Tranche 7.5,
 * l'écran manquait.
 *
 * DEUX CHOSES QUE L'ÉCRAN DOIT DIRE, parce qu'elles décident de ce que fait le clic :
 *
 *  1. **payer ne dégèle pas.** Un membre a déjà réglé ses 100 DT par e-card, et il reste gelé
 *     tant que personne n'a validé — il ne perçoit AUCUNE commission pendant ce temps. La file
 *     est donc bloquante, contrairement à celle des vérifications d'identité ;
 *  2. **la conséquence dépend de l'état du membre.** Un INACTIF est réactivé, avec une NOUVELLE
 *     baseline (les points arrivés pendant le gel ne lui rapporteront jamais rien) mais son
 *     carry-over d'avant le gel CONSERVÉ (D-034). Un ACTIF qui renouvelle par anticipation voit
 *     seulement son échéance repoussée — surtout pas de nouvelle baseline, qui lui coûterait son
 *     carry-over en cours. Le dialogue de confirmation annonce donc le bon des deux.
 *
 * AUCUN BOUTON DE REFUS, et l'écran l'explique : les e-cards sont brûlées au paiement et `USED`
 * est irréversible. Ce que deviendrait la valeur en cas de refus n'est pas tranché — l'admin
 * valide, ou laisse en attente.
 */
export function RenewalsPage() {
  const t = useT()
  const { hasRole } = useAuth()
  const canValidate = hasRole(["SUPER_ADMIN", "MANAGER"])

  const query = useQuery(pendingRenewalsQueryOptions)
  const validate = useValidateRenewal()
  const [confirming, setConfirming] = useState<PendingRenewal | null>(null)

  function submit(payment: PendingRenewal) {
    const wasFrozen = payment.memberStatus === "INACTIVE"
    validate.mutate(payment.id, {
      onSuccess: () => {
        toast.success(
          wasFrozen
            ? t("renewals.validatedFrozen")
            : t("renewals.validatedActive"),
        )
        setConfirming(null)
      },
      onError: (error) => {
        toast.error(t("renewals.validateFailed"), { description: errorMessage(error) })
        setConfirming(null)
      },
    })
  }

  const frozen = confirming?.memberStatus === "INACTIVE"

  return (
    <div className="space-y-6">
      <PageHeader title={t("renewals.title")} description={t("renewals.description")} />

      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>{t("renewals.title")}</AlertTitle>
        <AlertDescription>{t("renewals.blocking")}</AlertDescription>
      </Alert>

      {!canValidate ? (
        <p className="text-xs text-muted-foreground">{t("renewals.restricted")}</p>
      ) : null}

      <DataState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.length === 0}
        onRetry={() => void query.refetch()}
        rows={6}
      >
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t("renewals.column.member")}</TableHead>
                <TableHead>{t("ledger.column.name")}</TableHead>
                <TableHead className="w-28">{t("renewals.column.status")}</TableHead>
                <TableHead className="w-36 text-end">
                  {t("renewals.column.amount")}
                </TableHead>
                <TableHead className="w-40">{t("renewals.column.paidAt")}</TableHead>
                <TableHead className="w-40">
                  {t("renewals.column.renewalAt")}
                </TableHead>
                <TableHead className="w-32">{t("renewals.column.ecards")}</TableHead>
                <TableHead className="w-28">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to={`/members/${payment.memberId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {payment.memberCode}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {payment.lastName} {payment.firstName}
                  </TableCell>
                  <TableCell>
                    <MemberStatusBadge status={payment.memberStatus} />
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyDt value={payment.amountDt} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(payment.paidAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {payment.renewalAt ? formatDateTime(payment.renewalAt) : "—"}
                  </TableCell>
                  {/* Des IDENTIFIANTS d'e-cards, jamais leurs codes. */}
                  <TableCell className="font-mono text-xs">
                    {payment.ecardIds.map((id, index) => (
                      <span key={id}>
                        {index > 0 ? ", " : ""}
                        <Link
                          to={`/ecards/${id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          #{id}
                        </Link>
                      </span>
                    ))}
                  </TableCell>
                  <TableCell>
                    {canValidate ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirming(payment)}
                      >
                        {t("renewals.validate")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      </DataState>

      {query.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("renewals.empty")}</p>
      ) : null}

      <Alert>
        <Info />
        <AlertDescription>{t("renewals.noRefusal")}</AlertDescription>
      </Alert>

      <ConfirmDialog
        open={confirming !== null}
        title={
          frozen
            ? t("renewals.validateTitleFrozen")
            : t("renewals.validateTitleActive")
        }
        summary={
          confirming ? (
            <dl className="grid gap-1">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("common.member")}</dt>
                <dd className="font-medium">
                  {confirming.memberCode} — {confirming.lastName}{" "}
                  {confirming.firstName}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("renewals.column.amount")}</dt>
                <dd className="font-medium tabular-nums">
                  <MoneyDt value={confirming.amountDt} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("renewals.column.ecards")}
                </dt>
                <dd className="font-mono text-xs">
                  {confirming.ecardIds.map((id) => `#${id}`).join(", ")}
                </dd>
              </div>
            </dl>
          ) : null
        }
        consequence={
          frozen
            ? t("renewals.validateConsequenceFrozen")
            : t("renewals.validateConsequenceActive")
        }
        confirmLabel={t("renewals.validateConfirm")}
        destructive={false}
        pending={validate.isPending}
        onConfirm={() => confirming && submit(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}
