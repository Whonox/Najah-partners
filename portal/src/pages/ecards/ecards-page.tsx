import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { CalendarPlus, Eye, Plus, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataState } from "@/components/common/data-state"
import { Explain, Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import { StatCard } from "@/components/common/stat-card"
import { EcardStatusBadge } from "@/components/common/status-badge"
import { MoneyDt } from "@/components/format/amount"
import { errorMessage } from "@/api/error"
import {
  myEcardsQueryOptions,
  useExtendEcard,
  type Ecard,
} from "@/api/queries/ecards"
import { dashboardQueryOptions } from "@/api/queries/me"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { CreateEcardDialog } from "./create-ecard-dialog"
import { VerifyEcardDialog } from "./verify-ecard-dialog"

/**
 * MES E-CARDS (spec §7.1.3).
 *
 * ═══ AUCUN CODE N'EST AFFICHÉ SUR CET ÉCRAN, ET C'EST STRUCTUREL ═══
 * Le type `Ecard` vient d'un DTO backend SANS champ `code` (D-048) : écrire `ecard.code` ici
 * ne compilerait pas. La seule fenêtre où un code apparaît est celle de la création, une fois.
 * L'écran le DIT explicitement, parce qu'un affilié qui cherche son code et ne le trouve pas
 * croit d'abord à un bug — alors que c'est la protection qui fonctionne.
 *
 * Le cycle de vie est expliqué en tête : créer une e-card sort l'argent du solde, l'expiration
 * ou la révocation le rend. Sans cela, un affilié voit son solde baisser et pense s'être fait
 * dépouiller.
 */
export function EcardsPage() {
  const t = useT()
  const ecards = useQuery(myEcardsQueryOptions())
  const dashboard = useQuery(dashboardQueryOptions())
  const [createOpen, setCreateOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [extending, setExtending] = useState<Ecard | null>(null)

  const balanceDt = dashboard.data?.balanceDt ?? "0.000"

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("ecards.title")}
        description={t("ecards.subtitle")}
        actions={
          <>
            <Button variant="outline" onClick={() => setVerifyOpen(true)}>
              <Eye />
              {t("ecards.verify")}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              {t("ecards.create")}
            </Button>
          </>
        }
      />

      <StatCard
        tone="highlight"
        label={t("ecards.availableBalance")}
        value={<MoneyDt value={balanceDt} />}
        hint={t("dashboard.balanceHint")}
      />

      <Explain
        titleKey="explain.ecardCycle.title"
        bodyKey="explain.ecardCycle.body"
      />

      <Notice
        title={t("ecards.codeNeverShown")}
        icon={<ShieldCheck className="size-4 shrink-0" aria-hidden />}
      >
        {t("ecards.codeNeverShownHelp")}
      </Notice>

      <DataState
        isLoading={ecards.isPending}
        error={ecards.error}
        isEmpty={ecards.data?.length === 0}
        emptyMessage={t("ecards.empty")}
        emptyAction={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("ecards.create")}
          </Button>
        }
        onRetry={() => void ecards.refetch()}
      >
        {/* Des CARTES, pas un tableau : sur 390 px, un tableau de six colonnes se lit en
            faisant défiler horizontalement, ce qui est exactement ce qu'on veut éviter sur
            l'écran le plus consulté au téléphone. */}
        <ul className="space-y-3">
          {(ecards.data ?? []).map((ecard) => (
            <li key={ecard.id}>
              <EcardCard ecard={ecard} onExtend={() => setExtending(ecard)} />
            </li>
          ))}
        </ul>
      </DataState>

      <CreateEcardDialog
        open={createOpen}
        balanceDt={balanceDt}
        onOpenChange={setCreateOpen}
      />
      <VerifyEcardDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
      <ExtendDialog ecard={extending} onClose={() => setExtending(null)} />
    </div>
  )
}

function EcardCard({ ecard, onExtend }: { ecard: Ecard; onExtend: () => void }) {
  const t = useT()

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xl font-semibold">
            <MoneyDt value={ecard.valueDt} />
          </span>
          <EcardStatusBadge status={ecard.status} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label={t("ecards.createdAt")} value={formatDateTime(ecard.createdAt)} />
          {ecard.usedAt ? (
            <Row label={t("ecards.usedAt")} value={formatDateTime(ecard.usedAt)} />
          ) : null}
          <Row
            label={t("ecards.expiresAt")}
            value={
              ecard.expiresAt ? formatDateTime(ecard.expiresAt) : t("ecards.neverExpires")
            }
          />
          {ecard.closedAt ? (
            <Row label={t("ecards.closedAt")} value={formatDateTime(ecard.closedAt)} />
          ) : null}
        </dl>

        {/* Prolonger n'a de sens que sur une carte ACTIVE et datée : ressusciter une carte
            expirée, déjà remboursée, créerait de l'argent (D-026). */}
        {ecard.status === "ACTIVE" && ecard.expiresAt ? (
          <div>
            <Button variant="outline" size="sm" onClick={onExtend}>
              <CalendarPlus />
              {t("ecards.extend")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}

/** Prolongation d'échéance (D-026), bornée à 365 jours par le backend. */
function ExtendDialog({ ecard, onClose }: { ecard: Ecard | null; onClose: () => void }) {
  const t = useT()
  const extend = useExtendEcard()
  const [days, setDays] = useState("30")

  async function submit() {
    if (!ecard) return
    try {
      await extend.mutateAsync({ id: ecard.id, days: Number(days) })
      toast.success(t("ecards.extended"))
      onClose()
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  return (
    <Dialog open={ecard !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("ecards.extendTitle")}</DialogTitle>
          <DialogDescription>{t("ecards.extendHelp")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="extend-days">{t("ecards.extendDays")}</Label>
          <Input
            id="extend-days"
            inputMode="numeric"
            value={days}
            onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={extend.isPending}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={extend.isPending || days === "" || Number(days) <= 0}
          >
            {t("ecards.extend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
