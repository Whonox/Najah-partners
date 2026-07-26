import { useState, type FormEvent } from "react"
import { Link, Navigate, useLocation } from "react-router"
import { Network, ShieldCheck, Wallet } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage } from "@/api/error"
import { useAuth } from "@/auth/use-auth"
import { Brand } from "@/components/layout/brand"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { useT } from "@/i18n/use-t"

/**
 * Connexion affilié (D-016), refondue en Tranche 9.5.
 *
 * ═══ DEUX PANNEAUX SUR GRAND ÉCRAN, UN SEUL SUR TÉLÉPHONE ═══
 * La marque à gauche, le formulaire à droite. Le panneau de marque est PUREMENT décoratif —
 * il ne porte aucune information dont l'affilié ait besoin pour se connecter — et il est donc
 * masqué sous `lg` plutôt que réduit ou empilé. Sur un téléphone, l'espace vertical au-dessus
 * du clavier est la ressource rare : le remplir d'accroches repousserait le champ de saisie
 * hors de l'écran.
 *
 * ═══ UN SEUL CHAMP D'IDENTIFIANT ═══
 * Le backend accepte indifféremment l'e-mail, le téléphone ou le code membre. Proposer trois
 * onglets ferait porter à l'affilié une distinction technique qui ne le concerne pas : il
 * tape ce dont il se souvient, le serveur cherche dans les trois colonnes.
 *
 * ═══ LE LIEN D'INSCRIPTION EST VISIBLE, PAS RELÉGUÉ ═══
 * L'inscription est servie par le portail depuis D-052. Un nouveau filleul arrive ici avec un
 * code sponsor en main : s'il ne trouve pas où s'inscrire, il repart.
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
    <div className="flex min-h-svh bg-background">
      {/* Panneau de marque — décoratif, donc absent sous `lg`. */}
      <aside className="hidden w-2/5 flex-col justify-between bg-surface-soft p-10 lg:flex">
        <Brand />

        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold leading-tight text-surface-soft-foreground">
              {t("login.brandTitle")}
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">{t("login.brandBody")}</p>
          </div>

          <ul className="space-y-3">
            {[
              { Icon: Network, label: t("login.brandPointNetwork") },
              { Icon: Wallet, label: t("login.brandPointEarnings") },
              { Icon: ShieldCheck, label: t("login.brandPointSecurity") },
            ].map(({ Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="size-4 text-primary" aria-hidden />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">{t("login.brandFooter")}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between p-4">
          {/* La marque est déjà dans le panneau de gauche à partir de `lg` : la répéter
              ferait deux logos sur la même vue. On garde la place pour ne pas déplacer le
              sélecteur de thème d'un cran au changement de largeur. */}
          <div className="lg:invisible">
            <Brand />
          </div>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pb-10">
          <div className="w-full max-w-sm">
            <div className="mb-6 space-y-1">
              <h1 className="text-2xl font-semibold">{t("login.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
            </div>

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

            <div className="mt-8 rounded-xl border bg-card p-4 text-center">
              <p className="text-sm font-medium">{t("login.noAccountTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("login.noAccountBody")}</p>
              <Button
                variant="outline"
                className="mt-3 w-full"
                nativeButton={false}
                render={<Link to="/inscription" />}
              >
                {t("login.register")}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
