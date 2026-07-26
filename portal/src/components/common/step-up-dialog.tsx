import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useLocation } from "react-router"
import { KeyRound, MessageCircleQuestion, ShieldCheck } from "lucide-react"
import { apiClient } from "@/api/client"
import { unwrap } from "@/api/error"
import { registerStepUpRequester } from "@/api/step-up-gate"
import { stepUpStore } from "@/api/step-up-store"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/use-t"
import { SECURITY_QUESTION_LABEL } from "@/lib/security-questions"
import { cn } from "@/lib/utils"
import { PinInput } from "./pin-input"

/**
 * Boîte de dialogue de SECONDE AUTHENTIFICATION (D-051, D-058).
 *
 * ═══ DEUX VOIES, PRÉSENTÉES À ÉGALITÉ ═══
 * Le PIN et la question secrète valent la même chose. L'interface le montre : deux onglets de
 * même poids, aucun « ou sinon… », aucun repli. Hiérarchiser l'un ferait croire que l'autre
 * est un moyen dégradé — et un membre qui a oublié son PIN se croirait en difficulté alors
 * qu'il ne l'est pas.
 *
 * ═══ UN SEUL MESSAGE D'ERREUR, ET C'EST VOULU ═══
 * Le backend refuse de dire ce qui a échoué (PIN faux, réponse fausse, défi expiré, compte
 * bloqué : même code, même message). L'écran ne cherche donc PAS à deviner ni à enrichir :
 * il affiche ce que le serveur a dit. Ajouter ici « il vous reste 2 essais » ou « votre
 * compte est bloqué » reconstruirait côté client l'oracle que le serveur vient de refuser.
 *
 * ═══ CHANGER D'ONGLET NE REMET PAS LE COMPTEUR À ZÉRO ═══
 * Le compteur d'essais est COMMUN aux deux voies. L'écran ne le dit pas explicitement (voir
 * ci-dessus), mais il ne fait rien qui laisserait croire le contraire : passer à la question
 * secrète après un PIN refusé n'efface pas le message d'erreur, il le conserve.
 *
 * ═══ ANNULER EST PERMIS ═══
 * Fermer la boîte résout la demande à `null` : la requête d'origine rend son refus et l'écran
 * l'affiche. Rien ne piège l'affilié dans un dialogue qu'il ne veut pas remplir.
 *
 * ═══ CHANGER D'ÉCRAN ANNULE LA DEMANDE ═══
 * Le dialogue survivait à la navigation : on déclenchait la demande sur « Mes gains », on
 * partait sans répondre, et l'on se retrouvait sur « Parrainer » — un écran qui ne touche à
 * aucun argent — avec « Cette opération touche à votre argent, confirmez votre identité ».
 * Deux raisons de fermer, et la seconde compte plus que la première : d'abord c'est
 * incompréhensible, ensuite cela ENTRAÎNE à saisir son PIN sans savoir pour quoi. Une fenêtre
 * qui réclame un secret doit toujours se rattacher à une intention visible et actuelle ; celle
 * qui survit à un changement de contexte est le patron exact de l'hameçonnage.
 */

type Method = "PIN" | "QUESTION"

interface Challenge {
  questionKey: string
  challengeToken: string
}

interface PendingRequest {
  resolve: (token: string | null) => void
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const [method, setMethod] = useState<Method>("PIN")
  const [pin, setPin] = useState("")
  const [answer, setAnswer] = useState("")
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // La demande en cours est aussi gardée en ref : la fermeture peut survenir depuis un
  // gestionnaire qui ne voit pas le dernier état rendu.
  const pendingRef = useRef<PendingRequest | null>(null)

  const { pathname } = useLocation()

  const reset = useCallback(() => {
    setPin("")
    setAnswer("")
    setChallenge(null)
    setError(null)
    setBusy(false)
    setMethod("PIN")
  }, [])

  /** Résout la demande en cours — avec un jeton, ou `null` si le membre a renoncé. */
  const settle = useCallback(
    (token: string | null) => {
      pendingRef.current?.resolve(token)
      pendingRef.current = null
      setPending(null)
      reset()
    },
    [reset],
  )

  useEffect(() => {
    registerStepUpRequester(
      () =>
        new Promise<string | null>((resolve) => {
          const request = { resolve }
          pendingRef.current = request
          setPending(request)
        }),
    )
    return () => {
      registerStepUpRequester(null)
      // Le provider disparaît (déconnexion, rechargement) : une demande laissée en attente
      // bloquerait pour toujours la requête qui l'attend.
      pendingRef.current?.resolve(null)
      pendingRef.current = null
    }
  }, [])

  /**
   * Un changement d'écran annule la demande en attente (voir l'en-tête).
   *
   * On résout à `null`, exactement comme un « Annuler » : la requête d'origine rend son refus
   * et l'écran qu'on vient de quitter n'existe plus pour l'afficher — ce qui est correct, on
   * est parti. Ce que l'on veut surtout, c'est qu'aucun secret ne soit réclamé hors du
   * contexte qui le justifie.
   *
   * L'effet ne s'exécute pas au premier rendu : `pendingRef` est alors vide, et `settle` sur
   * une demande inexistante ne fait rien.
   */
  useEffect(() => {
    if (!pendingRef.current) return
    settle(null)
    // `settle` est stable (`useCallback` sans dépendance changeante) : c'est bien le
    // changement de CHEMIN qui déclenche, pas une recréation de fonction.
  }, [pathname, settle])

  /** Tire une question au hasard parmi les trois — le serveur choisit, pas nous (D-058). */
  const drawChallenge = useCallback(async () => {
    setBusy(true)
    try {
      const data = await unwrap(
        await apiClient.POST("/members/me/step-up/challenge", {}),
      )
      setChallenge({
        questionKey: data.questionKey,
        challengeToken: data.challengeToken,
      })
    } catch {
      // Un défi indisponible n'est pas un échec de vérification : on le dit à part, sans
      // consommer d'essai côté serveur (demander un défi n'en consomme aucun).
      setError(t("stepUp.challengeFailed"))
    } finally {
      setBusy(false)
    }
  }, [t])

  async function switchTo(next: Method) {
    setMethod(next)
    // L'erreur n'est PAS effacée : le compteur d'essais est commun aux deux voies, et faire
    // disparaître le message en changeant d'onglet suggérerait un nouveau départ.
    if (next === "QUESTION" && !challenge) {
      await drawChallenge()
    }
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const body =
        method === "PIN"
          ? ({ method: "PIN" as const, pin })
          : ({
              method: "QUESTION" as const,
              challengeToken: challenge?.challengeToken ?? "",
              answer,
            })

      const data = await unwrap(
        await apiClient.POST("/members/me/step-up/verify", { body }),
      )
      stepUpStore.set(data.stepUpToken, data.expiresAt)
      settle(data.stepUpToken)
    } catch (caught) {
      // On affiche EXACTEMENT le message du serveur, sans l'interpréter : lui seul sait ce
      // qu'il accepte de dire, et il a délibérément choisi de ne pas distinguer les cas.
      setError(caught instanceof Error ? caught.message : t("stepUp.refused"))
      setPin("")
      setAnswer("")
      // Le défi est à usage unique : en garder un déjà présenté ferait échouer l'essai
      // suivant pour une raison que le membre ne pourrait pas comprendre.
      if (method === "QUESTION") await drawChallenge()
    } finally {
      setBusy(false)
    }
  }

  const canSubmit =
    !busy &&
    (method === "PIN" ? pin.length >= 4 : answer.trim().length > 0 && challenge !== null)

  return (
    <>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden />
              {t("stepUp.title")}
            </DialogTitle>
            <DialogDescription>{t("stepUp.description")}</DialogDescription>
          </DialogHeader>

          {/* Deux voies de MÊME poids visuel : aucune n'est un repli de l'autre (D-051). */}
          <div role="tablist" aria-label={t("stepUp.methodLabel")} className="grid grid-cols-2 gap-2">
            <MethodTab
              active={method === "PIN"}
              icon={<KeyRound className="size-4" aria-hidden />}
              label={t("stepUp.methodPin")}
              onClick={() => void switchTo("PIN")}
            />
            <MethodTab
              active={method === "QUESTION"}
              icon={<MessageCircleQuestion className="size-4" aria-hidden />}
              label={t("stepUp.methodQuestion")}
              onClick={() => void switchTo("QUESTION")}
            />
          </div>

          <div className="min-h-32 pt-1">
            {method === "PIN" ? (
              <PinInput
                label={t("stepUp.pinLabel")}
                value={pin}
                onChange={setPin}
                length={4}
                disabled={busy}
                autoFocus
              />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="step-up-answer">
                  {challenge
                    ? SECURITY_QUESTION_LABEL[challenge.questionKey] ?? t("stepUp.questionFallback")
                    : t("stepUp.questionLoading")}
                </Label>
                <Input
                  id="step-up-answer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  disabled={busy || !challenge}
                  autoComplete="off"
                  placeholder={t("stepUp.answerPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("stepUp.answerHint")}</p>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => settle(null)} disabled={busy}>
              {t("action.cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={!canSubmit}>
              {busy ? t("stepUp.verifying") : t("stepUp.confirm")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t("stepUp.forgotPin")}</p>
        </DialogContent>
      </Dialog>
    </>
  )
}

function MethodTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  )
}
