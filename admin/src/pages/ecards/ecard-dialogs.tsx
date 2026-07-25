import { useState } from "react"
import { Check, Copy, ShieldAlert } from "lucide-react"
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
import {
  useExtendEcard,
  useGenesisEcard,
  useRevokeEcard,
  type EcardAdminRow,
  type GenesisEcardResponse,
} from "@/api/queries/ecards"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { MoneyDt } from "@/components/format/amount"
import { formatDt } from "@/lib/format"
import { useT } from "@/i18n/use-t"

const MILLIME_STEP = 0.001
const MAX_EXTENSION_DAYS = 365

/** Révocation : la valeur repart au créateur. Motif obligatoire (tracé dans l'audit). */
export function RevokeEcardDialog({
  ecard,
  onClose,
}: {
  ecard: EcardAdminRow
  onClose: () => void
}) {
  const t = useT()
  const revoke = useRevokeEcard()
  const [reason, setReason] = useState("")
  const [confirming, setConfirming] = useState(false)

  function submit() {
    revoke.mutate(
      { id: ecard.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t("ecards.revoked"))
          onClose()
        },
        onError: (error) => {
          toast.error(t("ecards.revokeFailed"), { description: errorMessage(error) })
          setConfirming(false)
        },
      },
    )
  }

  return (
    <>
      <Dialog open={!confirming} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ecards.revokeTitle")}</DialogTitle>
            <DialogDescription>{t("ecards.revokeDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <EcardSummary ecard={ecard} />
            {/* La conséquence est ÉCRITE, comme demandé : révoquer rembourse le créateur. */}
            <Alert>
              <AlertDescription>{t("ecards.revokeConsequence")}</AlertDescription>
            </Alert>
            <div className="grid gap-1.5">
              <Label htmlFor="revoke-reason">{t("common.reason")}</Label>
              <Textarea
                id="revoke-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("common.reasonRequired")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length === 0}
              onClick={() => setConfirming(true)}
            >
              {t("ecards.revoke")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        title={t("ecards.revokeTitle")}
        summary={<EcardSummaryLines ecard={ecard} reason={reason.trim()} />}
        consequence={t("ecards.revokeConsequence")}
        confirmLabel={t("ecards.revokeConfirm")}
        pending={revoke.isPending}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

/** Prolongation : aucune valeur créée, seule l'échéance bouge (D-026). Donc pas de confirmation. */
export function ExtendEcardDialog({
  ecard,
  onClose,
}: {
  ecard: EcardAdminRow
  onClose: () => void
}) {
  const t = useT()
  const extend = useExtendEcard()
  const [days, setDays] = useState("90")

  const parsed = Number(days)
  const valid =
    Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_EXTENSION_DAYS

  function submit() {
    extend.mutate(
      { id: ecard.id, days: parsed },
      {
        onSuccess: () => {
          toast.success(t("ecards.extended"))
          onClose()
        },
        onError: (error) =>
          toast.error(t("ecards.extendFailed"), { description: errorMessage(error) }),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ecards.extendTitle")}</DialogTitle>
          <DialogDescription>{t("ecards.extendDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <EcardSummary ecard={ecard} />
          <div className="grid gap-1.5">
            <Label htmlFor="extend-days">{t("ecards.extendDays")}</Label>
            <Input
              id="extend-days"
              type="number"
              min={1}
              max={MAX_EXTENSION_DAYS}
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("ecards.extendDaysHint")}
            </p>
            {days.trim() !== "" && !valid ? (
              <p className="text-xs text-destructive">{t("ecards.daysInvalid")}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={extend.isPending}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid || extend.isPending} onClick={submit}>
            {extend.isPending ? t("common.pending") : t("ecards.extend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * GENÈSE d'e-card (SUPER_ADMIN seul) : crée de la valeur ex nihilo — confirmation RENFORCÉE.
 *
 * ═══ LE SEUL ENDROIT DU BACK-OFFICE OÙ UN CODE S'AFFICHE ═══
 * Une carte de genèse n'a pas de créateur à qui demander son code, et aucun canal ne permettrait
 * de le transmettre (pas d'e-mail, D-011). Sans cet affichage, la carte serait inutilisable.
 * Le code est donc rendu UNE fois, ici, avec un avertissement explicite — puis oublié : il n'est
 * ni mis en cache, ni stocké, et aucune autre route de l'API ne le renverra jamais.
 */
export function GenesisEcardDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const genesis = useGenesisEcard()

  const [value, setValue] = useState("")
  const [expiration, setExpiration] = useState("")
  const [reason, setReason] = useState("")
  const [confirming, setConfirming] = useState(false)
  /** Le code créé, en mémoire de composant SEULEMENT — il disparaît à la fermeture. */
  const [created, setCreated] = useState<GenesisEcardResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const parsedValue = Number(value.replace(",", "."))
  const validValue =
    value.trim() !== "" &&
    Number.isFinite(parsedValue) &&
    parsedValue > 0 &&
    Number.isInteger(Math.round(parsedValue * 1000))

  const parsedExpiration = expiration.trim() === "" ? undefined : Number(expiration)
  const validExpiration =
    parsedExpiration === undefined ||
    (Number.isInteger(parsedExpiration) &&
      (parsedExpiration === -1 || parsedExpiration > 0))

  const validReason = reason.trim().length > 0

  function submit() {
    genesis.mutate(
      {
        valueDt: parsedValue,
        ...(parsedExpiration !== undefined ? { expirationDays: parsedExpiration } : {}),
        reason: reason.trim(),
      },
      {
        onSuccess: (ecard) => {
          setConfirming(false)
          setCreated(ecard)
        },
        onError: (error) => {
          toast.error(t("ecards.genesisFailed"), {
            description: errorMessage(error),
          })
          setConfirming(false)
        },
      },
    )
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.code)
      setCopied(true)
      toast.success(t("ecards.codeCopied"))
    } catch {
      // Le presse-papiers peut être refusé (contexte non sécurisé) : le code reste lisible
      // à l'écran, on ne bloque pas l'opération pour autant.
      setCopied(false)
    }
  }

  if (created) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ecards.codeRevealTitle")}</DialogTitle>
            <DialogDescription>{t("ecards.codeRevealBody")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="font-mono text-lg tracking-widest select-all">
                {created.code}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                <MoneyDt value={created.valueDt} className="justify-center" />
              </p>
            </div>

            {/* L'avertissement ne répète pas la description : il dit ce que l'autre ne dit pas —
                qu'aucun autre écran ne rendra ce code. */}
            <Alert variant="destructive">
              <ShieldAlert />
              <AlertDescription>{t("ecards.codeRevealWarning")}</AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />}
              {t("ecards.codeCopy")}
            </Button>
            <Button onClick={onClose}>{t("ecards.codeRevealDone")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={!confirming} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ecards.genesisTitle")}</DialogTitle>
            <DialogDescription>{t("ecards.genesisDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="genesis-value">{t("ecards.genesisValue")}</Label>
              <Input
                id="genesis-value"
                type="number"
                inputMode="decimal"
                step={MILLIME_STEP}
                min={MILLIME_STEP}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              {value.trim() !== "" && !validValue ? (
                <p className="text-xs text-destructive">{t("ecards.valueInvalid")}</p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="genesis-expiration">{t("ecards.genesisExpiration")}</Label>
              <Input
                id="genesis-expiration"
                type="number"
                value={expiration}
                onChange={(event) => setExpiration(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("ecards.genesisExpirationHint")}
              </p>
              {expiration.trim() !== "" && !validExpiration ? (
                <p className="text-xs text-destructive">
                  {t("ecards.expirationInvalid")}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="genesis-reason">{t("common.reason")}</Label>
              <Textarea
                id="genesis-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("common.reasonRequired")}
              </p>
            </div>

            <Alert variant="destructive">
              <ShieldAlert />
              <AlertDescription>{t("ecards.genesisConsequence")}</AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!validValue || !validExpiration || !validReason}
              onClick={() => setConfirming(true)}
            >
              {t("ecards.genesisAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        level="reinforced"
        title={t("ecards.genesisConfirmTitle")}
        summary={
          <dl className="grid gap-1">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("ecards.genesisValue")}</dt>
              <dd className="font-medium tabular-nums">{formatDt(parsedValue)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("common.reason")}</dt>
              <dd className="max-w-64 text-end">{reason.trim()}</dd>
            </div>
          </dl>
        }
        consequence={t("ecards.genesisConsequence")}
        confirmLabel={t("ecards.genesisConfirm")}
        pending={genesis.isPending}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

/** Rappel de l'identité de la carte — par son ID, jamais par son code. */
function EcardSummary({ ecard }: { ecard: EcardAdminRow }) {
  const t = useT()
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
      <span className="font-mono text-xs">
        {t("ecards.column.id")} #{ecard.id}
      </span>
      <MoneyDt value={ecard.valueDt} />
    </div>
  )
}

function EcardSummaryLines({
  ecard,
  reason,
}: {
  ecard: EcardAdminRow
  reason: string
}) {
  const t = useT()
  return (
    <dl className="grid gap-1">
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">{t("ecards.column.id")}</dt>
        <dd className="font-mono text-xs">#{ecard.id}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">{t("ecards.column.value")}</dt>
        <dd className="font-medium tabular-nums">{formatDt(ecard.valueDt)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">{t("ecards.column.creator")}</dt>
        <dd>{ecard.creatorMemberCode ?? t("ecardOrigin.GENESIS")}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">{t("common.reason")}</dt>
        <dd className="max-w-64 text-end">{reason}</dd>
      </div>
    </dl>
  )
}
