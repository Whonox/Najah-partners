import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { KeyRound } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataState } from "@/components/common/data-state"
import { Notice } from "@/components/common/explain"
import { PinInput } from "@/components/common/pin-input"
import { Surface, SurfaceHeader } from "@/components/common/surface"
import { apiClient } from "@/api/client"
import { errorMessage, unwrap } from "@/api/error"
import type { components } from "@/api/generated/schema"
import { stepUpStore } from "@/api/step-up-store"
import { SECURITY_QUESTION_LABEL } from "@/lib/security-questions"
import { useT } from "@/i18n/use-t"

type SecurityAnswerKey = components["schemas"]["SecurityAnswerDto"]["questionKey"]

/** Le backend en exige DEUX bonnes sur trois (D-058). On demande donc les trois, au choix. */
const REQUIRED_CORRECT = 2

/**
 * RÉINITIALISER MON CODE PIN — le seul recours qui existe (D-051, D-058).
 *
 * ═══ POURQUOI CET ÉCRAN DEVAIT EXISTER ═══
 * Le dialogue de seconde authentification dit, en toutes lettres : « Code PIN oublié ?
 * Réinitialisez-le depuis votre profil avec vos questions secrètes. » Cet écran n'existait pas.
 * La phrase désignait donc un recours introuvable — et comme aucun canal e-mail ni SMS n'existe
 * (D-011), un membre ayant oublié son PIN n'avait AUCUN moyen de retrouver l'accès à son
 * argent. Il pouvait encore répondre à une question secrète au moment de payer, mais rien ne le
 * lui disait, et rien ne lui rendait son PIN.
 *
 * ═══ ON DEMANDE SES TROIS QUESTIONS, PAS LE CATALOGUE ═══
 * Le serveur rend les CLÉS des trois questions que le membre a choisies (`GET .../questions`).
 * Sans cela, l'écran devrait lui faire retrouver les siennes parmi dix — et chaque essai raté
 * débiterait une tentative sur le compteur commun. Le recours censé le sauver serait devenu le
 * moyen le plus sûr de se bloquer.
 *
 * ═══ DEUX SUR TROIS, ET LE LOT COMPTE POUR UN SEUL ESSAI ═══
 * On saisit ce dont on se souvient ; le champ laissé vide n'est pas envoyé. Le backend exige
 * deux bonnes réponses et ne débite QU'UNE tentative pour l'ensemble — répondre à deux
 * questions en un geste n'est pas deux essais. L'écran le dit, parce qu'un membre qui croit
 * jouer sa dernière cartouche n'ose pas essayer.
 *
 * ═══ LE REFUS RESTE INDISTINCT ═══
 * Comme partout ailleurs sur ce compteur : on affiche le message du serveur tel quel, sans
 * chercher à désigner la réponse fautive — ce qu'il refuse délibérément de dire.
 */
export function PinSection() {
  const t = useT()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [pin, setPin] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const questions = useQuery({
    queryKey: ["step-up", "my-questions"],
    queryFn: async () => unwrap(await apiClient.GET("/members/me/step-up/questions")),
    staleTime: Infinity,
  })

  const keys = questions.data?.questionKeys ?? []
  const filled = keys.filter((key) => (answers[key] ?? "").trim().length >= 2)
  const mismatch = confirm !== "" && pin !== confirm
  const canSubmit =
    filled.length >= REQUIRED_CORRECT && pin.length >= 4 && pin === confirm && !busy

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await unwrap(
        await apiClient.POST("/members/me/step-up/pin/reset", {
          body: {
            // Seules les questions RÉELLEMENT remplies partent : envoyer une réponse vide
            // ferait compter une mauvaise réponse là où le membre n'a rien prétendu savoir.
            answers: filled.map((key) => ({
              questionKey: key as SecurityAnswerKey,
              answer: (answers[key] ?? "").trim(),
            })),
            newPin: pin,
          },
        }),
      )

      // Le PIN a changé : un jeton de step-up obtenu avec l'ANCIEN n'a plus lieu d'être en
      // mémoire. Le vider force une nouvelle preuve d'identité à la prochaine opération
      // sensible — c'est le comportement qu'on attend après avoir changé un secret.
      stepUpStore.clear()

      setAnswers({})
      setPin("")
      setConfirm("")
      toast.success(t("pin.resetDone"))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Surface as="section">
      <SurfaceHeader
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="size-5" aria-hidden />
            {t("pin.resetTitle")}
          </span>
        }
        description={t("pin.resetSubtitle")}
      />

      <Notice>{t("pin.resetOnlyRecourse")}</Notice>

      <DataState
        isLoading={questions.isPending}
        error={questions.error}
        onRetry={() => void questions.refetch()}
        rows={3}
      >
        <div className="mt-4 space-y-5">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("pin.resetAnswerHint", { count: REQUIRED_CORRECT })}
            </p>

            {keys.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`reset-${key}`}>
                  {SECURITY_QUESTION_LABEL[key] ?? key}
                </Label>
                <Input
                  id={`reset-${key}`}
                  autoComplete="off"
                  value={answers[key] ?? ""}
                  disabled={busy}
                  onChange={(event) => {
                    setAnswers((current) => ({ ...current, [key]: event.target.value }))
                    setError(null)
                  }}
                />
              </div>
            ))}

            <p className="text-xs text-muted-foreground">{t("pin.resetCaseHint")}</p>
          </div>

          {/* `PinInput` porte SON libellé et le lie au groupe de cases (`aria-labelledby`) :
              en ajouter un second au-dessus ferait annoncer deux fois la même chose, et le
              premier ne serait lié à rien. */}
          <div className="space-y-4 border-t pt-4">
            <PinInput
              value={pin}
              onChange={setPin}
              disabled={busy}
              label={t("pin.resetNew")}
            />
            <PinInput
              value={confirm}
              onChange={setConfirm}
              disabled={busy}
              label={t("pin.resetConfirm")}
              error={mismatch ? t("pin.resetMismatch") : undefined}
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? t("pin.resetting") : t("pin.resetSubmit")}
          </Button>
        </div>
      </DataState>
    </Surface>
  )
}
