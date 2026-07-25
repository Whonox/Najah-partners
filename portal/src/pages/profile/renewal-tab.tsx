import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Clock } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataState } from "@/components/common/data-state"
import { EcardPayment } from "@/components/common/ecard-payment"
import { Notice } from "@/components/common/explain"
import { RenewalStatusBadge } from "@/components/common/status-badge"
import { MoneyDt } from "@/components/format/amount"
import { errorMessage } from "@/api/error"
import {
  myRenewalsQueryOptions,
  usePayRenewal,
  type MemberProfile,
} from "@/api/queries/me"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/**
 * RENOUVELLEMENT ANNUEL (spec §5.9, D-038) — DEUX TEMPS, et le second ne m'appartient pas.
 *
 * ═══ CE QUE L'ÉCRAN DOIT ABSOLUMENT DIRE ═══
 * Payer NE DÉGÈLE PAS. Le paiement brûle les e-cards et crée une demande `PENDING_VALIDATION` ;
 * c'est l'administration qui valide, et c'est cette validation seule qui réactive un compte
 * gelé. Un affilié qui croit avoir retrouvé ses droits en payant constatera dans une semaine
 * qu'il n'a rien perçu — et il aura raison de se plaindre si personne ne le lui a dit.
 *
 * Un second paiement pendant qu'un premier attend est refusé par le backend (il brûlerait des
 * cartes pour rien) : le bouton disparaît, avec l'explication.
 */
export function RenewalTab({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const { refreshProfile } = useAuth()
  const renewals = useQuery(myRenewalsQueryOptions())
  const pay = usePayRenewal()
  const [codes, setCodes] = useState<string[]>([])

  const pending = profile.renewal.lastPaymentStatus === "PENDING_VALIDATION"
  const neverActivated = profile.activatedAt === null

  async function submit() {
    try {
      await pay.mutateAsync({ ecardCodes: codes })
      await refreshProfile()
      setCodes([])
      toast.success(t("renewalTab.paid"))
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  return (
    <div className="space-y-4">
      <Notice tone="warning" title={t("renewalTab.twoSteps")}>
        {t("renewalTab.twoStepsBody")}
      </Notice>

      <Card>
        <CardHeader>
          <CardTitle>{t("renewalTab.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t("renewalTab.dueDate")}</dt>
              <dd className="font-medium">
                {profile.renewal.renewalAt
                  ? formatDateTime(profile.renewal.renewalAt)
                  : t("renewalTab.noDueDate")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("renewalTab.amount")}</dt>
              <dd className="font-medium">
                <MoneyDt value={profile.renewal.amountDueDt} />
              </dd>
            </div>
          </dl>

          {neverActivated ? (
            <Notice>{t("renewalTab.notRegistered")}</Notice>
          ) : pending ? (
            <Notice
              tone="warning"
              title={t("renewal.pendingValidation")}
              icon={<Clock className="size-4 shrink-0" aria-hidden />}
            >
              {t("renewalTab.alreadyPending")}
            </Notice>
          ) : (
            <>
              <EcardPayment
                dueDt={profile.renewal.amountDueDt}
                codes={codes}
                onChange={setCodes}
                disabled={pay.isPending}
              />

              {pay.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage(pay.error)}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                className="w-full"
                disabled={codes.length === 0 || pay.isPending}
                onClick={() => void submit()}
              >
                {pay.isPending ? t("renewalTab.paying") : t("renewalTab.pay")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("renewalTab.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataState
            isLoading={renewals.isPending}
            error={renewals.error}
            isEmpty={renewals.data?.length === 0}
            emptyMessage={t("renewalTab.historyEmpty")}
            onRetry={() => void renewals.refetch()}
            rows={2}
          >
            <ul className="space-y-3">
              {(renewals.data ?? []).map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      <MoneyDt value={payment.amountDt} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("renewalTab.paidAt")} {formatDateTime(payment.paidAt)}
                      {payment.validatedAt
                        ? ` · ${t("renewalTab.validatedAt")} ${formatDateTime(payment.validatedAt)}`
                        : ""}
                    </p>
                  </div>
                  <RenewalStatusBadge status={payment.status} />
                </li>
              ))}
            </ul>
          </DataState>
        </CardContent>
      </Card>
    </div>
  )
}
