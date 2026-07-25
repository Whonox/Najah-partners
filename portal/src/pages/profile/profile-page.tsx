import { useState, type FormEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Lock, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataState } from "@/components/common/data-state"
import { Notice } from "@/components/common/explain"
import { PageHeader } from "@/components/common/page-header"
import {
  MemberStatusBadge,
  VerificationBadge,
} from "@/components/common/status-badge"
import { MoneyDt, PointsBv } from "@/components/format/amount"
import { errorMessage } from "@/api/error"
import {
  profileQueryOptions,
  useChangePassword,
  useUpdateProfile,
  type MemberProfile,
} from "@/api/queries/me"
import { useAuth } from "@/auth/use-auth"
import { formatDateTime } from "@/lib/format"
import { useT } from "@/i18n/use-t"
import { RenewalTab } from "./renewal-tab"

/**
 * MON PROFIL (spec §7.1.7) — trois onglets : informations, sécurité, renouvellement.
 *
 * AUCUNE DONNÉE BANCAIRE n'y figure, et il n'y en a nulle part dans le produit : la plateforme
 * ne fait ni virement ni prélèvement, il n'y a donc pas de KYC financier. L'écran le dit, parce
 * qu'un affilié habitué à d'autres plateformes cherchera où saisir un RIB.
 */
export function ProfilePage() {
  const t = useT()
  const profile = useQuery(profileQueryOptions())

  return (
    <div className="space-y-6">
      <PageHeader title={t("profile.title")} description={t("profile.subtitle")} />

      <DataState
        isLoading={profile.isPending}
        error={profile.error}
        onRetry={() => void profile.refetch()}
        rows={3}
      >
        {profile.data ? (
          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info">{t("profile.tabInfo")}</TabsTrigger>
              <TabsTrigger value="security">{t("profile.tabSecurity")}</TabsTrigger>
              <TabsTrigger value="renewal">{t("profile.tabRenewal")}</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 pt-4">
              {/* `key` sur l'identité : quand le profil change côté serveur (nom corrigé par
                  l'administration, activation…), le formulaire se REMONTE avec les nouvelles
                  valeurs. C'est la façon React de resynchroniser un état local sur une prop,
                  sans effet qui rappellerait setState et déclencherait un rendu en cascade. */}
              <IdentitySection
                key={`${profile.data.firstName}|${profile.data.lastName}`}
                profile={profile.data}
              />
              <VerificationSection profile={profile.data} />
              <PositionSection profile={profile.data} />
            </TabsContent>

            <TabsContent value="security" className="pt-4">
              <PasswordSection />
            </TabsContent>

            <TabsContent value="renewal" className="pt-4">
              <RenewalTab profile={profile.data} />
            </TabsContent>
          </Tabs>
        ) : null}
      </DataState>
    </div>
  )
}

/**
 * Nom et prénom sont modifiables ; l'e-mail et le téléphone ne le sont PAS (D-049).
 *
 * Ils ne sont pas seulement grisés : le type de la mutation ne les accepte pas (le DTO backend
 * ne les porte pas), donc une requête forgée ne les changerait pas davantage. L'écran affiche
 * la RAISON — ce sont des identifiants de connexion, et il n'existe aucun canal de
 * confirmation (D-011) : une faute de frappe coûterait l'accès au compte, sans « mot de passe
 * oublié » fonctionnel pour la rattraper.
 */
function IdentitySection({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const update = useUpdateProfile()
  // L'état de saisie part des valeurs du serveur. La resynchronisation, quand le profil
  // change ailleurs, se fait par REMONTAGE (`key` posée par l'appelant) et non par un effet
  // qui rappellerait setState — un effet écraserait au passage une saisie en cours.
  const [firstName, setFirstName] = useState(profile.firstName)
  const [lastName, setLastName] = useState(profile.lastName)

  const dirty = firstName !== profile.firstName || lastName !== profile.lastName

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await update.mutateAsync({ firstName, lastName })
      toast.success(t("profile.saved"))
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.identity")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">{t("profile.firstName")}</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">{t("profile.lastName")}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </div>

          {update.error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(update.error)}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={!dirty || update.isPending}>
            {update.isPending ? t("profile.saving") : t("profile.save")}
          </Button>
        </form>

        <div className="space-y-4 border-t pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ReadOnly label={t("profile.email")} value={profile.email ?? "—"} />
            <ReadOnly label={t("profile.phone")} value={profile.phone ?? "—"} />
          </div>
          <Notice
            title={t("profile.loginIdsTitle")}
            icon={<Lock className="size-4 shrink-0" aria-hidden />}
          >
            {t("profile.loginIdsLocked")}
          </Notice>
        </div>

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <ReadOnly label={t("profile.memberCode")} value={profile.memberCode} mono />
          <ReadOnly
            label={t("profile.registeredAt")}
            value={formatDateTime(profile.registeredAt)}
          />
        </div>

        <Notice>{t("profile.noBankData")}</Notice>
      </CardContent>
    </Card>
  )
}

/** Vérification d'identité (D-018) — informative, NON bloquante, et l'écran le dit. */
function VerificationSection({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const { verification } = profile

  return (
    <Card>
      <CardHeader>
        {/* Le titre nomme la SECTION, pas l'état : mettre « En cours de vérification » en
            titre ferait lire un statut là où l'on attend un intitulé, et l'affilié verrait
            deux fois la même phrase (le badge le dit déjà, juste en dessous). */}
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" aria-hidden />
          {t("verification.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <VerificationBadge status={verification.status} />

        <dl className="grid gap-3 sm:grid-cols-2">
          {verification.documentType ? (
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("verification.documentType")}
              </dt>
              <dd>{t(`idDocument.${verification.documentType}`)}</dd>
            </div>
          ) : null}
          {verification.documentNumber ? (
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("verification.documentNumber")}
              </dt>
              <dd className="font-mono text-sm">{verification.documentNumber}</dd>
            </div>
          ) : null}
        </dl>

        {verification.status === "REJECTED" && verification.reason ? (
          <Notice tone="warning" title={t("verification.rejectedReason")}>
            {verification.reason}
          </Notice>
        ) : null}

        <Notice>{t("verification.nonBlocking")}</Notice>
      </CardContent>
    </Card>
  )
}

/** Ma position : statut, pack figé, acompte. Sponsor et upline vivent sur l'écran « réseau ». */
function PositionSection({ profile }: { profile: MemberProfile }) {
  const t = useT()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.position")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <MemberStatusBadge status={profile.status} />
          <span className="text-sm text-muted-foreground">
            {t(`status.${profile.status}.help`)}
          </span>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          {profile.activatedAt ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t("profile.activatedAt")}</dt>
              <dd>{formatDateTime(profile.activatedAt)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("profile.registrationPaid")}
            </dt>
            <dd>
              <MoneyDt value={profile.registrationPaidDt} />
            </dd>
            <dd className="text-xs text-muted-foreground">
              {t("profile.registrationPaidHint")}
            </dd>
          </div>
        </dl>

        {profile.pack ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="font-medium">{profile.pack.packName}</p>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <Pair
                label={t("activation.packTier")}
                value={<PointsBv value={profile.pack.tierBv} />}
              />
              <Pair
                label={t("activation.packCap")}
                value={<MoneyDt value={profile.pack.weeklyCapDt} />}
              />
              <Pair
                label={t("activation.packDirect")}
                value={<MoneyDt value={profile.pack.directCommissionDt} />}
              />
              <Pair
                label={t("activation.packIndirect")}
                value={<MoneyDt value={profile.pack.indirectCommissionDt} />}
              />
            </dl>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Changement de mot de passe. Le backend RÉVOQUE toutes les sessions : on enchaîne donc sur une
 * déconnexion PROPRE plutôt que de laisser l'écran croire qu'il est encore connecté avec un
 * jeton qui ne vaut plus rien — le premier appel suivant échouerait en 401 sans explication.
 */
function PasswordSection() {
  const t = useT()
  const { logout } = useAuth()
  const change = useChangePassword()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")

  const mismatch = confirm !== "" && next !== confirm
  const tooShort = next !== "" && next.length < 8
  const canSubmit =
    current !== "" && next !== "" && confirm !== "" && !mismatch && !tooShort

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next })
      toast.success(t("password.success"))
      await logout()
    } catch (cause) {
      toast.error(errorMessage(cause))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("password.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Notice tone="warning">{t("password.logoutNotice")}</Notice>

        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="current-password">{t("password.current")}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t("password.new")}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
            {tooShort ? (
              <p className="text-sm text-destructive">{t("password.tooShort")}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">{t("password.confirm")}</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            {mismatch ? (
              <p className="text-sm text-destructive">{t("password.mismatch")}</p>
            ) : null}
          </div>

          {change.error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(change.error)}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={!canSubmit || change.isPending}>
            {change.isPending ? t("password.submitting") : t("password.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ReadOnly({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-sm" : "text-sm"}>{value}</p>
    </div>
  )
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
