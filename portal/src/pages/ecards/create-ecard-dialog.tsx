import { useState } from "react"
import { AlertTriangle } from "lucide-react"
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
import { CopyButton } from "@/components/common/copy-button"
import { Notice } from "@/components/common/explain"
import { MoneyDt } from "@/components/format/amount"
import { errorMessage } from "@/api/error"
import { useCreateEcard, type CreatedEcard } from "@/api/queries/ecards"
import { formatDt } from "@/lib/format"
import { useT } from "@/i18n/use-t"

/** Trois décimales au maximum : le millime. Postgres arrondirait en silence au-delà. */
const AMOUNT_PATTERN = /^\d+([.,]\d{1,3})?$/

/**
 * CRÉER UNE E-CARD — et révéler son code UNE SEULE FOIS.
 *
 * Deux temps dans une même boîte de dialogue :
 *  1. la saisie du montant (libre, D-030, plafonné au solde disponible) ;
 *  2. la RÉVÉLATION du code, qui ne se reproduira jamais.
 *
 * ═══ POURQUOI LE CODE N'EST MONTRÉ QU'ICI ═══
 * Le DTO de liste ne porte pas de champ `code` (D-048) : le réafficher ailleurs ne compilerait
 * pas. Ce n'est donc pas cet écran qui « choisit » de le cacher ensuite — il n'y a rien à
 * cacher, la valeur n'existe plus côté client dès que la boîte se ferme. Le code n'est mis ni
 * dans le cache TanStack, ni dans l'URL, ni dans un stockage : il vit dans un état local, vidé
 * à la fermeture.
 *
 * L'avertissement est donc affiché AVANT le code, pas après : lu en dessous, il arriverait
 * après le réflexe de fermeture.
 *
 * VALIDATION CÔTÉ ÉCRAN : elle sert à donner un message utile tout de suite (« ce montant
 * dépasse votre solde »), jamais à décider. C'est le backend qui refuse — le solde peut avoir
 * bougé entre l'affichage et l'envoi.
 */
export function CreateEcardDialog({
  open,
  balanceDt,
  onOpenChange,
}: {
  open: boolean
  /** Solde disponible, tel que l'API vient de le rendre (chaîne décimale). */
  balanceDt: string
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const create = useCreateEcard()
  const [amount, setAmount] = useState("")
  const [created, setCreated] = useState<CreatedEcard | null>(null)

  const normalized = amount.replace(",", ".")
  const numeric = Number(normalized)
  const balance = Number(balanceDt)

  const localError =
    amount === ""
      ? null
      : !AMOUNT_PATTERN.test(amount.trim())
        ? t("ecardCreate.tooPrecise")
        : numeric <= 0
          ? t("ecardCreate.tooLow")
          : numeric > balance
            ? t("ecardCreate.tooHigh")
            : null

  const canSubmit = amount !== "" && localError === null && !create.isPending

  function close() {
    // Le code est perdu ICI, volontairement : plus aucune trace côté client.
    setCreated(null)
    setAmount("")
    create.reset()
    onOpenChange(false)
  }

  async function submit() {
    const result = await create.mutateAsync({ valueDt: numeric })
    setCreated(result)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("ecardCreate.successTitle")}</DialogTitle>
            </DialogHeader>

            <Notice
              tone="warning"
              title={t("ecardCreate.warningTitle")}
              icon={<AlertTriangle className="size-4 shrink-0" aria-hidden />}
            >
              {t("ecardCreate.warning", { amount: `${formatDt(created.valueDt)} ${t("unit.dt")}` })}
            </Notice>

            <div className="space-y-2">
              <Label htmlFor="ecard-code">{t("ecardCreate.codeLabel")}</Label>
              <output
                id="ecard-code"
                className="block rounded-lg border border-highlight-border bg-highlight px-4 py-3 text-center font-mono text-lg font-semibold tracking-wider text-highlight-foreground select-all"
              >
                {created.code}
              </output>
              <CopyButton
                value={created.code}
                label={t("ecardCreate.copy")}
                successMessage={t("ecardCreate.copied")}
                className="w-full"
              />
            </div>

            <DialogFooter>
              <Button onClick={close}>{t("ecardCreate.done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("ecardCreate.title")}</DialogTitle>
              <DialogDescription>{t("ecardCreate.subtitle")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="ecard-amount">{t("ecardCreate.amount")}</Label>
              <Input
                id="ecard-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                placeholder="0.000"
                onChange={(event) => setAmount(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("ecardCreate.amountHint", {
                  balance: `${formatDt(balanceDt)} ${t("unit.dt")}`,
                })}
              </p>
              {localError ? (
                <p className="text-sm text-destructive">{localError}</p>
              ) : null}
            </div>

            {canSubmit ? (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <p className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("ecards.value")}</span>
                  <MoneyDt value={normalized} />
                </p>
              </div>
            ) : null}

            {create.error ? (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(create.error)}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={close} disabled={create.isPending}>
                {t("action.cancel")}
              </Button>
              <Button onClick={() => void submit()} disabled={!canSubmit}>
                {create.isPending ? t("ecardCreate.submitting") : t("ecardCreate.submit")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
