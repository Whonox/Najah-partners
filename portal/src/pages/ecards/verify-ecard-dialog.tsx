import { useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"
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
import { MoneyDt } from "@/components/format/amount"
import { ApiError } from "@/api/error"
import { useVerifyEcard } from "@/api/queries/ecards"
import { useT } from "@/i18n/use-t"
import type { TranslationKey } from "@/i18n/fr"

/**
 * VÉRIFIER UNE E-CARD REÇUE : validité et valeur, sans la consommer.
 *
 * L'écran s'adresse à celui qui REÇOIT un code, pas à celui qui l'a émis : « on m'a envoyé
 * ça, est-ce que ça vaut quelque chose ? ». La réponse est donc précise (expirée, déjà
 * utilisée, révoquée) — cette route est authentifiée, un tâtonnement y est nominatif et
 * traçable, et le backend la limite en débit. C'est l'inverse de l'inscription publique, où
 * le refus est volontairement indistinct.
 *
 * Le résultat n'est PAS mis en cache : un code saisi est de la valeur au porteur, le garder en
 * mémoire du client le ferait survivre à la fermeture de l'écran.
 */
export function VerifyEcardDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  const verify = useVerifyEcard()
  const [code, setCode] = useState("")

  function close() {
    setCode("")
    verify.reset()
    onOpenChange(false)
  }

  const result = verify.data
  // 404 = code inconnu. Le distinguer d'une carte expirée est légitime ICI (route
  // authentifiée) et rend le message utile : « vous vous êtes trompé en recopiant » n'appelle
  // pas la même action que « cette carte a déjà servi ».
  const notFound = verify.error instanceof ApiError && verify.error.status === 404

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("ecardVerify.title")}</DialogTitle>
          <DialogDescription>{t("ecardVerify.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="verify-code">{t("ecardVerify.code")}</Label>
          <Input
            id="verify-code"
            value={code}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="XXX-XXX-XXX-XXX"
            className="font-mono tracking-wider"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <p className="text-xs text-muted-foreground">{t("ecardVerify.noConsume")}</p>
        </div>

        {notFound ? (
          <ResultBox valid={false} message={t("ecardVerify.notFound")} />
        ) : result ? (
          <ResultBox
            valid={result.valid}
            message={t(result.valid ? "ecardVerify.valid" : "ecardVerify.invalid")}
            detail={
              result.valid ? undefined : reasonLabel(result.reason, result.status)
            }
            value={result.valid ? result.valueDt : undefined}
          />
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={close}>
            {t("action.close")}
          </Button>
          <Button
            onClick={() => verify.mutate({ code })}
            disabled={code.trim() === "" || verify.isPending}
          >
            {verify.isPending ? t("ecardVerify.submitting") : t("ecardVerify.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * `reason` vaut « EXPIRED » ou le statut en cause. On ne traduit que ce qu'on connaît : une
 * valeur inattendue est rendue telle quelle plutôt que remplacée par un message inventé.
 */
function reasonLabel(
  reason: string | null | undefined,
  status: string,
): TranslationKey | undefined {
  const key = `ecardVerify.reason.${reason ?? status}`
  return key === "ecardVerify.reason.EXPIRED" ||
    key === "ecardVerify.reason.USED" ||
    key === "ecardVerify.reason.REVOKED"
    ? (key as TranslationKey)
    : undefined
}

function ResultBox({
  valid,
  message,
  detail,
  value,
}: {
  valid: boolean
  message: string
  detail?: TranslationKey
  value?: string
}) {
  const t = useT()

  return (
    <div
      className={
        valid
          ? "rounded-lg border border-success/40 bg-success/10 p-3"
          : "rounded-lg border border-destructive/40 bg-destructive/10 p-3"
      }
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        {valid ? (
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
        ) : (
          <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
        )}
        {message}
      </p>
      {detail ? (
        <p className="mt-1 text-sm text-muted-foreground">{t(detail)}</p>
      ) : null}
      {value ? (
        <p className="mt-2 text-lg font-semibold">
          <MoneyDt value={value} />
        </p>
      ) : null}
    </div>
  )
}
