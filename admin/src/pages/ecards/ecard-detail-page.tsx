import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import { ArrowLeft, CalendarPlus, Ban, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ecardQueryOptions } from "@/api/queries/ecards"
import { DataState } from "@/components/common/data-state"
import { PageHeader } from "@/components/common/page-header"
import { MoneyDt } from "@/components/format/amount"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { ExtendEcardDialog, RevokeEcardDialog } from "./ecard-dialogs"
import { EcardOriginBadge, EcardStatusBadge } from "./ecards-page"

/**
 * Fiche d'une e-card (spec §7.2.9) : traçabilité complète création → utilisation, et ce qu'elle
 * a payé. Sans son code, ici comme ailleurs.
 *
 * L'absence de mouvement de solde à la consommation est EXPLIQUÉE et non laissée vide : c'est le
 * modèle même de l'e-card (D-025 — elle paie, elle ne recharge aucun solde), et un tableau vide
 * sans explication se lirait comme une donnée manquante.
 */
export function EcardDetailPage() {
  const t = useT()
  const params = useParams()
  const id = Number(params.ecardId)
  const { hasRole } = useAuth()
  const canAct = hasRole(["SUPER_ADMIN", "MANAGER"])

  const [action, setAction] = useState<"revoke" | "extend" | null>(null)
  const query = useQuery(ecardQueryOptions(id))
  const ecard = query.data

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ms-2" nativeButton={false}
              render={<Link to="/ecards" />}>
        <ArrowLeft />
        {t("ecards.detailBack")}
      </Button>

      <DataState
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        rows={5}
      >
        {ecard ? (
          <div className="space-y-6">
            <PageHeader
              title={`${t("ecards.detailTitle")} #${ecard.id}`}
              actions={
                canAct && ecard.status === "ACTIVE" ? (
                  <>
                    <Button variant="outline" onClick={() => setAction("extend")}>
                      <CalendarPlus />
                      {t("ecards.extend")}
                    </Button>
                    <Button variant="destructive" onClick={() => setAction("revoke")}>
                      <Ban />
                      {t("ecards.revoke")}
                    </Button>
                  </>
                ) : null
              }
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t("ecards.traceTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row label={t("ecards.column.value")}>
                    <MoneyDt value={ecard.valueDt} />
                  </Row>
                  <Row label={t("ecards.column.status")}>
                    <EcardStatusBadge status={ecard.status} />
                  </Row>
                  <Row label={t("ecards.column.origin")}>
                    <EcardOriginBadge origin={ecard.origin} />
                  </Row>
                  <Row label={t("ecards.traceCreated")}>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(ecard.createdAt)}
                    </span>
                  </Row>
                  <Row label={t("ecards.column.expiresAt")}>
                    <span className="text-xs text-muted-foreground">
                      {ecard.expiresAt
                        ? formatDateTime(ecard.expiresAt)
                        : t("ecards.unlimited")}
                    </span>
                  </Row>
                  <Row label={t("ecards.traceUsed")}>
                    <span className="text-xs text-muted-foreground">
                      {ecard.usedAt ? formatDateTime(ecard.usedAt) : "—"}
                    </span>
                  </Row>
                  <Row label={t("ecards.traceClosed")}>
                    <span className="text-xs text-muted-foreground">
                      {ecard.closedAt ? formatDateTime(ecard.closedAt) : "—"}
                    </span>
                  </Row>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {t("ecards.column.creator")} / {t("ecards.column.user")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row label={t("ecards.column.creator")}>
                    {ecard.creatorMemberId !== null ? (
                      <Link
                        to={`/members/${ecard.creatorMemberId}`}
                        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {ecard.creatorMemberCode} — {ecard.creatorName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Row>
                  <Row label={t("ecards.column.user")}>
                    {ecard.userMemberId !== null ? (
                      <Link
                        to={`/members/${ecard.userMemberId}`}
                        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {ecard.userMemberCode} — {ecard.userName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Row>
                  <Row label={t("ecards.column.paid")}>
                    {ecard.orderId !== null ? (
                      <Link
                        to={`/orders/${ecard.orderId}`}
                        className="text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {t("ecards.paidOrder")} #{ecard.orderId}
                      </Link>
                    ) : ecard.membershipPaymentId !== null ? (
                      <span className="text-xs">
                        {t("ecards.paidMembership")} #{ecard.membershipPaymentId}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("ecards.paidNothing")}
                      </span>
                    )}
                  </Row>

                  {ecard.origin === "GENESIS" ? (
                    <Alert>
                      <Info />
                      <AlertDescription>
                        {t("ecards.genesisNoCreator")}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("ecards.ledgerTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {ecard.ledgerEntries.length === 0 ? (
                  /* Deux absences de mouvement, deux causes distinctes : une carte de GENÈSE n'a
                     jamais débité personne, tandis qu'une carte consommée n'écrit rien À LA
                     CONSOMMATION (D-025). Le même texte pour les deux ferait passer une carte de
                     genèse encore active pour une carte déjà dépensée. */
                  <p className="p-4 text-sm text-muted-foreground">
                    {t(
                      ecard.origin === "GENESIS"
                        ? "ecards.ledgerEmptyGenesis"
                        : "ecards.ledgerEmpty",
                    )}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">{t("common.date")}</TableHead>
                        <TableHead>{t("ledger.column.type")}</TableHead>
                        <TableHead className="w-36 text-end">
                          {t("ledger.column.amount")}
                        </TableHead>
                        <TableHead className="w-28">{t("common.member")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ecard.ledgerEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm">{entry.type}</TableCell>
                          <TableCell className="text-end">
                            <MoneyDt value={entry.amountDt} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            <Link
                              to={`/members/${entry.memberId}`}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              #{entry.memberId}
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {action === "revoke" ? (
              <RevokeEcardDialog ecard={ecard} onClose={() => setAction(null)} />
            ) : null}
            {action === "extend" ? (
              <ExtendEcardDialog ecard={ecard} onClose={() => setAction(null)} />
            ) : null}
          </div>
        ) : null}
      </DataState>
    </div>
  )
}

function Row({
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
