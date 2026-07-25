import { useState, type FormEvent } from "react"
import { Link } from "react-router"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Notice } from "@/components/common/explain"
import { apiClient } from "@/api/client"
import { unwrap } from "@/api/error"
import { Brand } from "@/components/layout/brand"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { useT } from "@/i18n/use-t"

/**
 * Mot de passe oublié — L'ÉCRAN LE PLUS HONNÊTE DU PORTAIL.
 *
 * Le circuit backend existe : la demande crée un jeton de réinitialisation à usage unique. Ce
 * qui n'existe pas, c'est le CANAL pour l'acheminer — la plateforme n'envoie ni e-mail ni SMS
 * (D-011). Un affilié qui verrait « un e-mail vous a été envoyé » attendrait un message qui
 * n'arrivera jamais, puis appellerait le support en pensant à un problème technique.
 *
 * On expose donc l'écran, on enregistre la demande — elle est réelle —, et on DIT que rien ne
 * sera envoyé et qu'il faut passer par l'administration. Ne rien simuler est ici la seule
 * conduite tenable : c'est la version de l'écran qui coûte le moins de tickets.
 *
 * La réponse du serveur est par ailleurs volontairement NEUTRE (identique que l'identifiant
 * existe ou non) pour ne pas révéler l'existence d'un compte : l'écran le dit aussi, sinon
 * l'affilié conclurait de l'absence d'erreur que son identifiant est le bon.
 */
export function ForgotPasswordPage() {
  const t = useT()
  const [identifier, setIdentifier] = useState("")
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      await unwrap(
        await apiClient.POST("/auth/member/password/forgot", { body: { identifier } }),
      )
    } catch {
      // La réponse est neutre par construction. Même un échec réseau ne doit pas produire un
      // message différent : ce serait rétablir l'oracle que la neutralité vient supprimer.
    } finally {
      setDone(true)
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="flex items-center justify-between p-4">
        <Brand />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-start justify-center p-4 sm:items-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">{t("forgot.title")}</CardTitle>
            <CardDescription>{t("forgot.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* L'avertissement est AVANT le formulaire, pas après l'envoi : le lire une fois la
                demande partie serait apprendre trop tard qu'elle n'aboutira pas toute seule. */}
            <Notice
              tone="warning"
              title={t("forgot.noChannelTitle")}
              icon={<AlertTriangle className="size-4 shrink-0" aria-hidden />}
            >
              {t("forgot.noChannel")}
            </Notice>

            {done ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium">{t("forgot.done")}</p>
                <p className="text-sm text-muted-foreground">{t("forgot.neutralNotice")}</p>
                <Button variant="outline" nativeButton={false} render={<Link to="/connexion" />}>
                  {t("login.back")}
                </Button>
              </div>
            ) : (
              <form className="flex flex-col gap-5" onSubmit={(event) => void onSubmit(event)}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="identifier">{t("login.identifier")}</Label>
                  <Input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    required
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
                </div>

                <Button type="submit" disabled={pending}>
                  {t("forgot.submit")}
                </Button>

                <Link
                  to="/connexion"
                  className="text-center text-sm text-link underline-offset-4 hover:underline"
                >
                  {t("login.back")}
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
