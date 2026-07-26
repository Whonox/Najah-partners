import { useState } from "react"
import { apiClient } from "@/api/client"
import { errorMessage, unwrap } from "@/api/error"
import { PinInput } from "@/components/common/pin-input"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/use-t"

const PIN_LENGTH = 4

/**
 * Étape 3 — création du code PIN (D-050).
 *
 * ═══ DOUBLE SAISIE, ET C'EST NÉCESSAIRE ═══
 * Le PIN est masqué à la frappe et ne sera JAMAIS réaffiché. Une faute de frappe non détectée
 * ici coûterait au membre l'accès à ses écrans d'argent jusqu'à ce qu'il pense à passer par
 * ses questions secrètes. La confirmation est donc vérifiée localement, avant l'envoi.
 *
 * ═══ CE QUE L'ÉCRAN NE DÉCIDE PAS ═══
 * Le refus d'un PIN trop devinable (chiffres identiques, suite) vient du SERVEUR (D-058). On
 * ne le reproduit pas ici : deux implémentations de la même règle divergent, et c'est celle
 * du serveur qui fait autorité. On se contente d'annoncer la règle, puis d'afficher son
 * refus s'il tombe.
 */
export function PinStep({
  onDone,
  onError,
}: {
  onDone: () => void
  onError: (message: string | null) => void
}) {
  const t = useT()
  const [pin, setPin] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [mismatch, setMismatch] = useState(false)

  const filled = pin.length === PIN_LENGTH && confirm.length === PIN_LENGTH

  async function submit() {
    if (pin !== confirm) {
      setMismatch(true)
      return
    }
    setMismatch(false)
    setBusy(true)
    onError(null)
    try {
      await unwrap(await apiClient.POST("/members/me/onboarding/pin", { body: { pin } }))
      onDone()
    } catch (cause) {
      // Refus du serveur (format, PIN trop simple) : on l'affiche tel quel et on repart d'une
      // saisie vide — laisser un PIN refusé dans les cases inviterait à resoumettre le même.
      onError(errorMessage(cause))
      setPin("")
      setConfirm("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("onboarding.pin.intro")}</p>

      <PinInput
        label={t("onboarding.pin.choose")}
        value={pin}
        onChange={(value) => {
          setPin(value)
          setMismatch(false)
        }}
        length={PIN_LENGTH}
        disabled={busy}
        autoFocus
      />

      <PinInput
        label={t("onboarding.pin.confirm")}
        value={confirm}
        onChange={(value) => {
          setConfirm(value)
          setMismatch(false)
        }}
        length={PIN_LENGTH}
        disabled={busy}
        error={mismatch ? t("onboarding.pin.mismatch") : undefined}
      />

      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        {t("onboarding.pin.rules")}
      </p>

      <Button className="w-full" disabled={!filled || busy} onClick={() => void submit()}>
        {busy ? t("onboarding.pin.saving") : t("onboarding.pin.submit")}
      </Button>
    </div>
  )
}
