import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, ShieldCheck } from "lucide-react"
import { apiClient } from "@/api/client"
import { errorMessage, unwrap } from "@/api/error"
import { useAuth } from "@/auth/use-auth"
import { Stepper } from "@/components/common/stepper"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Brand } from "@/components/layout/brand"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { useT } from "@/i18n/use-t"
import { IdDocumentStep } from "./id-document-step"
import { PinStep } from "./pin-step"
import { SecurityQuestionsStep } from "./security-questions-step"

/**
 * PREMIÈRE CONNEXION — parcours obligatoire en trois étapes (D-050).
 *
 * ═══ CE QUI BLOQUE, ET CE QUI NE BLOQUE PAS ═══
 * Le PARCOURS bloque : tant que les trois étapes ne sont pas faites, le backend refuse toute
 * route membre (403 `ONBOARDING_REQUIRED`, D-057) et cet écran est le seul accessible. La
 * VÉRIFICATION par l'administration, elle, ne bloque RIEN (D-018) : une fois l'image déposée,
 * le membre entre, achète, s'active et perçoit sans attendre le moindre verdict. L'écran le
 * dit explicitement à la fin — c'est la confusion la plus probable, et la plus décourageante
 * si on la laisse s'installer.
 *
 * ═══ L'ÉTAT VIENT DU SERVEUR, PAS DU PARCOURS ═══
 * Après chaque étape, on relit `GET /members/me/onboarding`. On ne déduit jamais localement
 * « il en reste deux » : un membre peut avoir commencé sur un autre appareil, ou avoir déposé
 * sa pièce puis fermé l'onglet. La reprise doit tomber au bon endroit.
 *
 * ═══ POURQUOI PAS DE VALIDATION ADMIN ICI ═══
 * Rien n'attend. Le membre termine, il entre. Le badge « en attente de vérification »
 * l'informe, il n'interdit rien.
 */
export function OnboardingPage() {
  const t = useT()
  const { member, refreshProfile } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)

  const status = useQuery({
    queryKey: ["onboarding", "status"],
    queryFn: async () => unwrap(await apiClient.GET("/members/me/onboarding")),
  })

  const state = status.data

  // L'étape courante est DÉDUITE de l'état serveur, jamais d'un compteur local : c'est ce qui
  // rend la reprise correcte après une interruption ou un changement d'appareil.
  const current = !state
    ? 0
    : !state.idDocumentUploaded
      ? 0
      : !state.securityQuestionsSet
        ? 1
        : !state.pinSet
          ? 2
          : 3

  async function afterStep() {
    setError(null)
    await status.refetch()
  }

  /**
   * Entrée dans le portail. Le profil est relu — c'est lui qui porte
   * `onboardingCompleted`, et c'est sur cette valeur que la barrière de route décide. Sans ce
   * rafraîchissement, le membre resterait renvoyé ici en boucle malgré un parcours terminé.
   */
  async function enterPortal() {
    setFinishing(true)
    try {
      await refreshProfile()
    } catch (cause) {
      setError(errorMessage(cause))
      setFinishing(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Brand />
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-semibold">
            {t("onboarding.title")}
            {member ? `, ${member.firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
        </div>

        <Stepper
          className="mb-6"
          current={Math.min(current, 2)}
          steps={[
            { label: t("onboarding.step.document") },
            { label: t("onboarding.step.questions") },
            { label: t("onboarding.step.pin") },
          ]}
        />

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {status.isPending ? (
          <p className="text-sm text-muted-foreground">{t("state.loading")}</p>
        ) : current === 3 ? (
          <Card>
            <CardContent className="space-y-5 pt-6 text-center">
              <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">{t("onboarding.done.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("onboarding.done.body")}</p>
              </div>

              {/* D-018 : la vérification par l'administration ne bloque RIEN. Le dire ici,
                  au moment où l'on entre, évite que le membre attende un verdict qui ne
                  conditionne rien. */}
              <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-start text-xs text-muted-foreground">
                <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
                <span>{t("onboarding.done.verificationNotice")}</span>
              </div>

              <Button className="w-full" disabled={finishing} onClick={() => void enterPortal()}>
                {finishing ? t("onboarding.done.entering") : t("onboarding.done.enter")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {current === 0
                  ? t("onboarding.step.document")
                  : current === 1
                    ? t("onboarding.step.questions")
                    : t("onboarding.step.pin")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {current === 0 && (
                <IdDocumentStep
                  documentType={state?.idDocumentType ?? null}
                  documentNumber={state?.idDocumentNumber ?? null}
                  key="document"
                  onDone={() => void afterStep()}
                  onError={setError}
                />
              )}
              {current === 1 && (
                <SecurityQuestionsStep onDone={() => void afterStep()} onError={setError} />
              )}
              {current === 2 && <PinStep onDone={() => void afterStep()} onError={setError} />}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
