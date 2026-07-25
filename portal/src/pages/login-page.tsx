import { useState, type FormEvent } from "react"
import { Link, Navigate, useLocation } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { errorMessage } from "@/api/error"
import { useAuth } from "@/auth/use-auth"
import { Brand } from "@/components/layout/brand"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { useT } from "@/i18n/use-t"

/**
 * Connexion affilié (D-016).
 *
 * UN SEUL CHAMP D'IDENTIFIANT, et c'est un choix : le backend accepte indifféremment l'e-mail,
 * le téléphone ou le code membre. Proposer trois onglets « connexion par… » ferait porter à
 * l'affilié une distinction technique qui ne le concerne pas — il tape ce dont il se souvient,
 * le serveur cherche dans les trois colonnes.
 *
 * Le mot de passe ne sert qu'à obtenir un access token gardé EN MÉMOIRE et un cookie refresh
 * httpOnly : rien de tout cela ne transite par le stockage du navigateur, et rien n'est
 * conservé après la déconnexion.
 */
export function LoginPage() {
  const t = useT()
  const { status, login } = useAuth()
  const location = useLocation()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? "/"} replace />
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      await login(identifier, password)
    } catch (cause) {
      // Le backend répond volontairement la même erreur pour « identifiant inconnu » et
      // « mauvais mot de passe » (spec §5.10) : on n'en dit pas plus ici.
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="flex items-center justify-between p-4">
        <Brand />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">{t("login.title")}</CardTitle>
            <CardDescription>{t("login.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-5" onSubmit={(event) => void onSubmit(event)}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="identifier">{t("login.identifier")}</Label>
                <Input
                  id="identifier"
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("login.identifierHint")}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">{t("login.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" disabled={pending}>
                {pending ? t("login.submitting") : t("login.submit")}
              </Button>

              <Link
                to="/mot-de-passe-oublie"
                className="text-center text-sm text-link underline-offset-4 hover:underline"
              >
                {t("login.forgot")}
              </Link>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
