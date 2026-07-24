import { useState, type FormEvent } from "react"
import { Navigate, useLocation } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage } from "@/api/error"
import { useAuth } from "@/auth/use-auth"
import { Brand } from "@/components/layout/brand"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { useT } from "@/i18n/use-t"
import { HOME_PATH } from "@/lib/nav"

/**
 * Connexion administrateur (D-016). Le mot de passe ne sert qu'à obtenir un access token gardé
 * EN MÉMOIRE et un cookie refresh httpOnly : rien de tout cela ne transite par le stockage du
 * navigateur, et rien n'est conservé après la déconnexion.
 */
export function LoginPage() {
  const t = useT()
  const { status, login } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (status === "authenticated") {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? HOME_PATH} replace />
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      await login(email, password)
    } catch (cause) {
      // Le backend répond volontairement la même erreur pour « e-mail inconnu » et « mauvais
      // mot de passe » (spec §5.10) : on n'en dit pas plus ici.
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
            <CardTitle>{t("login.title")}</CardTitle>
            <CardDescription>{t("login.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">{t("login.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
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
                {pending ? t("login.pending") : t("login.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
