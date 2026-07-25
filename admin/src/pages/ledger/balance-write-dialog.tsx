import { useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/api/error"
import { useAdjustBalance, useGenesisBalance, type BalanceRow } from "@/api/queries/ledger"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { MoneyDt } from "@/components/format/amount"
import { formatDt } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/** Le millime, et pas plus fin : le backend refuse une 4ᵉ décimale (Postgres l'arrondirait). */
const MILLIME_STEP = 0.001

/**
 * Les DEUX écritures manuelles du grand livre, dans un seul composant parce qu'elles partagent
 * la même mécanique (un montant, un motif, une confirmation) — mais avec deux niveaux de gravité
 * radicalement différents, et l'écran doit le faire sentir :
 *
 *  — **ajustement** : déplace de la valeur existante. Confirmation simple, récapitulatif chiffré ;
 *  — **genèse** : CRÉE de la valeur qui n'existait pas (D-017b). Confirmation RENFORCÉE (il faut
 *    recopier un mot), et le texte dit « ex nihilo » plutôt qu'un euphémisme. C'est l'opération
 *    la plus lourde de conséquence de toute la plateforme : la masse monétaire augmente sans
 *    qu'aucune contrepartie n'ait été payée.
 *
 * Le montant est saisi en DT et part en `number` — c'est ce que le DTO attend, et une valeur au
 * millime tient exactement dans un double. Le motif est OBLIGATOIRE dans les deux cas : côté
 * serveur aussi, depuis la Tranche 8c (la genèse l'acceptait vide, ce qui rendait sa ligne
 * d'audit muette).
 */
export function BalanceWriteDialog({
  mode,
  member,
  onClose,
}: {
  mode: "adjust" | "genesis"
  member: BalanceRow
  onClose: () => void
}) {
  const t = useT()
  const adjust = useAdjustBalance()
  const genesis = useGenesisBalance()
  const isGenesis = mode === "genesis"

  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [confirming, setConfirming] = useState(false)

  const parsed = Number(amount.replace(",", "."))
  const validAmount =
    amount.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed !== 0 &&
    // Trois décimales au maximum : au-delà, Postgres arrondirait en silence.
    Number.isInteger(Math.round(parsed * 1000)) &&
    Math.abs(parsed * 1000 - Math.round(parsed * 1000)) < 1e-6 &&
    // La genèse ne peut que CRÉER : un « débit ex nihilo » n'a pas de sens.
    (!isGenesis || parsed > 0)
  const validReason = reason.trim().length > 0
  const pending = adjust.isPending || genesis.isPending

  function submit() {
    const variables = {
      memberId: member.memberId,
      amountDt: parsed,
      reason: reason.trim(),
    }
    const handlers = {
      onSuccess: () => {
        toast.success(isGenesis ? t("ledger.genesisDone") : t("ledger.adjusted"))
        setConfirming(false)
        onClose()
      },
      onError: (error: unknown) => {
        toast.error(isGenesis ? t("ledger.genesisFailed") : t("ledger.adjustFailed"), {
          description: errorMessage(error),
        })
        setConfirming(false)
      },
    }

    if (isGenesis) {
      genesis.mutate(variables, handlers)
    } else {
      adjust.mutate(variables, handlers)
    }
  }

  return (
    <>
      <Dialog open={!confirming} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isGenesis ? t("ledger.genesisTitle") : t("ledger.adjustTitle")}
            </DialogTitle>
            <DialogDescription>
              {isGenesis
                ? t("ledger.genesisDescription")
                : t("ledger.adjustDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-mono text-xs">{member.memberCode}</span>{" "}
                  <span className="font-medium">
                    {member.lastName} {member.firstName}
                  </span>
                </span>
                <MoneyDt value={member.balanceDt} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="balance-amount">
                {isGenesis ? t("ledger.genesisAmount") : t("ledger.adjustAmount")}
              </Label>
              <Input
                id="balance-amount"
                type="number"
                inputMode="decimal"
                step={MILLIME_STEP}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              {amount.trim() !== "" && !validAmount ? (
                <p className="text-xs text-destructive">
                  {isGenesis ? t("ledger.amountPositive") : t("ledger.amountInvalid")}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="balance-reason">{t("common.reason")}</Label>
              <Textarea
                id="balance-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("common.reasonRequired")}
              </p>
            </div>

            {isGenesis ? (
              <Alert variant="destructive">
                <AlertDescription>{t("ledger.genesisConsequence")}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!validAmount || !validReason || pending}
              onClick={() => setConfirming(true)}
            >
              {isGenesis ? t("ledger.genesis") : t("ledger.adjust")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* La confirmation RÉCAPITULE : qui, combien, pourquoi. Un « êtes-vous sûr ? » nu ne
          permettrait pas de rattraper une erreur de saisie, qui est justement le risque. */}
      <ConfirmDialog
        open={confirming}
        level={isGenesis ? "reinforced" : "normal"}
        title={
          isGenesis ? t("ledger.genesisConfirmTitle") : t("ledger.adjustConfirmTitle")
        }
        summary={
          <dl className="grid gap-1">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("common.member")}</dt>
              <dd className="font-medium">
                {member.memberCode} — {member.lastName} {member.firstName}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("common.amountDt")}</dt>
              <dd className="font-medium tabular-nums">{formatDt(parsed)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("common.reason")}</dt>
              <dd className="max-w-64 text-end">{reason.trim()}</dd>
            </div>
          </dl>
        }
        consequence={
          isGenesis ? t("ledger.genesisConsequence") : t("ledger.adjustConsequence")
        }
        confirmLabel={
          isGenesis ? t("ledger.genesisConfirm") : t("ledger.adjustConfirm")
        }
        pending={pending}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
