import { useState } from "react"
import { Link, Navigate } from "react-router"
import { CheckCircle2 } from "lucide-react"
import { apiClient } from "@/api/client"
import {
  ApiError,
  errorMessage,
  REGISTRATION_PAYMENT_REFUSED,
  unwrap,
} from "@/api/error"
import { useAuth } from "@/auth/use-auth"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Stepper } from "@/components/common/stepper"
import { Brand } from "@/components/layout/brand"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { CopyButton } from "@/components/common/copy-button"
import { useT } from "@/i18n/use-t"
import {
  IdentityStep,
  PaymentStep,
  PlacementStep,
  RegisterSummary,
  SponsorStep,
} from "./register-steps"
import {
  checkPlacement,
  EMPTY_FORM,
  REGISTER_STEPS,
  stepErrors,
  useRegistrationFee,
  useStepper,
  type RegistrationForm,
} from "./use-registration"

/**
 * INSCRIPTION — formulaire PUBLIC et ANONYME, servi par le portail (D-052, révise la
 * répartition actée en T9 où elle appartenait à la vitrine).
 *
 * ═══ CE QUI EST INTERDIT ICI, ET POURQUOI ═══
 * Aucune vérification d'e-card pendant la saisie. Aucun retour disant si un code existe, s'il
 * est déjà utilisé, ni ce qu'il vaut. Aucun total qui se mettrait à jour. Cette page est
 * accessible sans compte : le moindre retour immédiat sur un code en ferait un ORACLE
 * d'énumération de l'espace des codes — exactement ce que le backend refuse de fournir (aucun
 * endpoint public de vérification, message d'erreur d'inscription volontairement INDISTINCT).
 * Voir `EcardCodesInput`, écrit spécialement muet pour cet écran.
 *
 * ═══ LES CODES MEMBRES, EUX, SONT VÉRIFIÉS — MAIS SANS RIEN RÉVÉLER (D-061) ═══
 * La sortie de l'étape 3 interroge le serveur sur le TRIPLET parrain + upline + jambe, et
 * n'obtient qu'un oui ou un non. Sponsor inconnu, upline inconnu, upline hors du réseau du
 * sponsor, position occupée : réponse identique. C'est le compromis de D-061 — un code membre
 * n'est pas une valeur au porteur, et découvrir à l'étape du PAIEMENT que son code de parrain
 * était faux est une épreuve qu'on peut éviter sans rien concéder.
 *
 * La distinction avec les e-cards est nette et doit le rester : un code membre se transmet et
 * se partage, un code d'e-card EST de l'argent.
 *
 * ═══ LA VALIDATION LOCALE EST UNE VALIDATION DE FORME ═══
 * Champs obligatoires, mots de passe identiques, `NP` suivi de six chiffres. Rien de métier :
 * ni palier, ni montant calculé, ni règle de placement (D-022 est vérifiée par le serveur, qui
 * seul connaît l'arbre). Une contrainte SYNTAXIQUE ne révèle rien — elle dit qu'un code ne peut
 * pas avoir cette forme, jamais qu'un code existe.
 *
 * ═══ ÉTAT EN MÉMOIRE UNIQUEMENT ═══
 * Un brouillon porte un mot de passe en clair et des codes d'e-card. Rien ne va dans
 * `localStorage` ni dans l'URL — une reprise après fermeture d'onglet ne vaut pas de laisser
 * cela sur un poste partagé.
 */
export function RegisterPage() {
  const t = useT()
  const { status } = useAuth()
  const fee = useRegistrationFee()

  const [form, setForm] = useState<RegistrationForm>(EMPTY_FORM)
  const [showErrors, setShowErrors] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ memberCode: string } | null>(null)
  const [checkingPlacement, setCheckingPlacement] = useState(false)

  const stepper = useStepper(REGISTER_STEPS.length)

  // Déjà connecté : s'inscrire n'a pas de sens, et le formulaire consommerait des e-cards
  // pour créer un SECOND compte sans que ce soit l'intention.
  if (status === "authenticated") return <Navigate to="/" replace />

  const step = REGISTER_STEPS[stepper.current]
  const errors = stepErrors(step, form)
  const visibleErrors = showErrors ? errors : []

  function set<K extends keyof RegistrationForm>(key: K, value: RegistrationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setShowErrors(false)
  }

  /**
   * Passage à l'étape suivante.
   *
   * La sortie de l'étape PLACEMENT est la seule à interroger le serveur (D-061) : elle
   * vérifie parrain + upline + jambe ENSEMBLE, pour que l'affilié n'apprenne pas à l'étape du
   * paiement que son code de parrain était faux. Le refus est indistinct — on affiche le
   * message du serveur tel quel, sans chercher à désigner le champ fautif, ce que le serveur
   * refuse délibérément de nous dire.
   *
   * Les autres étapes ne déclenchent AUCUN appel : la sortie de l'étape des e-cards passe
   * directement au récapitulatif (D-052).
   */
  async function goNext() {
    if (errors.length > 0) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setServerError(null)

    if (step === "placement") {
      setCheckingPlacement(true)
      try {
        await checkPlacement(form)
      } catch (cause) {
        setServerError(errorMessage(cause))
        return
      } finally {
        setCheckingPlacement(false)
      }
    }

    if (stepper.isLast) {
      setReviewing(true)
      return
    }
    stepper.next()
  }

  async function submit() {
    setSubmitting(true)
    setServerError(null)
    try {
      const codes = form.ecardCodes.map((c) => c.trim()).filter((c) => c.length > 0)
      const payload = {
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password,
        sponsorCode: form.sponsorCode.trim(),
        uplineCode: form.uplineCode.trim(),
        leg: form.leg as "LEFT" | "RIGHT",
        idDocumentType: form.idDocumentType,
        idDocumentNumber: form.idDocumentNumber.trim(),
        ecardCodes: codes,
      }

      const result = await unwrap(
        await apiClient.POST("/members/register", {
          body: payload,
          // Le contrat est en `multipart/form-data` (il acceptait un fichier avant D-060).
          // On sérialise donc à la main plutôt que d'envoyer du JSON qu'il ne lirait pas.
          // `Content-Type: null` est nécessaire : c'est au navigateur de poser l'en-tête,
          // avec sa frontière — l'écrire nous-mêmes produirait un corps illisible.
          bodySerializer: (body: Record<string, unknown>) => {
            const data = new FormData()
            for (const [key, value] of Object.entries(body)) {
              if (value === undefined) continue
              if (Array.isArray(value)) {
                for (const item of value) data.append(key, String(item))
              } else {
                data.append(key, String(value))
              }
            }
            return data
          },
          headers: { "Content-Type": null },
        }),
      )
      setCreated({ memberCode: result.memberCode })
    } catch (cause) {
      // Le message vient du serveur TEL QUEL. Pour un paiement refusé, il est volontairement
      // indistinct (D-036) : ne pas chercher à l'interpréter ni à le préciser.
      setServerError(errorMessage(cause))
      setReviewing(false)

      // Un paiement refusé ramène à l'ÉTAPE DES E-CARDS, pas au récapitulatif. Le serveur
      // nomme l'étape (`REGISTRATION_PAYMENT_REFUSED`) sans jamais nommer le code fautif : on
      // sait donc QUOI reprendre, et l'affilié n'a pas à relire quatre écrans pour le deviner.
      if (cause instanceof ApiError && cause.code === REGISTRATION_PAYMENT_REFUSED) {
        stepper.goTo(REGISTER_STEPS.indexOf("payment"))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (created) return <RegistrationDone memberCode={created.memberCode} />

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Brand />
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-semibold">{t("register.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("register.subtitle")}</p>
        </div>

        <Stepper
          className="mb-6"
          current={reviewing ? REGISTER_STEPS.length - 1 : stepper.current}
          steps={[
            { label: t("register.step.sponsor") },
            { label: t("register.step.identity") },
            { label: t("register.step.placement") },
            { label: t("register.step.payment") },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {reviewing ? t("register.summary.title") : t(`register.step.${step}` as never)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            {reviewing ? (
              <RegisterSummary
                form={form}
                feeDt={fee.data?.amountDt ?? "0.000"}
                onEdit={(index) => {
                  setReviewing(false)
                  stepper.goTo(index)
                }}
              />
            ) : (
              <>
                {step === "sponsor" && (
                  <SponsorStep form={form} set={set} errors={visibleErrors} disabled={submitting} />
                )}
                {step === "identity" && (
                  <IdentityStep form={form} set={set} errors={visibleErrors} disabled={submitting} />
                )}
                {step === "placement" && (
                  <PlacementStep form={form} set={set} errors={visibleErrors} disabled={submitting} />
                )}
                {step === "payment" && (
                  <PaymentStep
                    form={form}
                    set={set}
                    errors={visibleErrors}
                    disabled={submitting}
                    feeDt={fee.data?.amountDt ?? "0.000"}
                  />
                )}
              </>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                disabled={submitting || (stepper.current === 0 && !reviewing)}
                onClick={() => (reviewing ? setReviewing(false) : stepper.back())}
              >
                {t("action.previous")}
              </Button>

              {reviewing ? (
                <Button type="button" disabled={submitting} onClick={() => void submit()}>
                  {submitting ? t("register.submitting") : t("register.submit")}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={submitting || checkingPlacement}
                  onClick={() => void goNext()}
                >
                  {checkingPlacement
                    ? t("register.checking")
                    : stepper.isLast
                      ? t("register.review")
                      : t("action.next")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("register.haveAccount")}{" "}
          <Link to="/connexion" className="text-link underline-offset-4 hover:underline">
            {t("register.signIn")}
          </Link>
        </p>
      </main>
    </div>
  )
}

/**
 * Confirmation. Le CODE MEMBRE est la seule chose à retenir de cet écran : c'est l'identifiant
 * de connexion que l'affilié utilisera, et il ne lui sera envoyé par aucun canal — il n'en
 * existe aucun (D-011). D'où la mise en avant et le bouton de copie.
 */
function RegistrationDone({ memberCode }: { memberCode: string }) {
  const t = useT()
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <Card>
          <CardContent className="space-y-5 pt-6 text-center">
            <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{t("register.done.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("register.done.body")}</p>
            </div>

            <div className="rounded-lg border border-highlight-border bg-highlight p-4">
              <p className="text-xs text-muted-foreground">{t("register.done.codeLabel")}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-wider">{memberCode}</p>
              <div className="mt-2 flex justify-center">
                <CopyButton value={memberCode} label={t("action.copy")} />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">{t("register.done.next")}</p>

            <Button
              className="w-full"
              nativeButton={false}
              render={<Link to="/connexion" />}
            >
              {t("register.done.signIn")}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
