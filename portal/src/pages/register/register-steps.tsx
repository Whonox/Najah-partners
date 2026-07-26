import { Info } from "lucide-react"
import { EcardCodesInput } from "@/components/common/ecard-codes-input"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MoneyDt } from "@/components/format/amount"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"
import type { IdDocumentType, Leg, RegistrationForm } from "./use-registration"

interface StepProps {
  form: RegistrationForm
  set: <K extends keyof RegistrationForm>(key: K, value: RegistrationForm[K]) => void
  errors: string[]
  disabled?: boolean
}

/** Champ étiqueté + message d'erreur, pour ne pas répéter la même structure douze fois. */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

// ─────────────────────────── Étape 1 — le parrain ───────────────────────────

export function SponsorStep({ form, set, errors, disabled }: StepProps) {
  const t = useT()
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("register.sponsor.intro")}</p>
      <Field
        id="sponsorCode"
        label={t("register.sponsor.label")}
        hint={t("register.sponsor.hint")}
        error={errors.includes("sponsorCode") ? t("register.sponsor.error") : undefined}
      >
        <Input
          id="sponsorCode"
          value={form.sponsorCode}
          onChange={(e) => set("sponsorCode", e.target.value.toUpperCase())}
          placeholder="NP000963"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled}
          className="font-mono tracking-wider"
        />
      </Field>
    </div>
  )
}

// ────────────────── Étape 2 — identité, contact, pièce, mot de passe ──────────────────

const ID_TYPES: Array<{ value: IdDocumentType; key: "idCard" | "passport" | "license" }> = [
  { value: "ID_CARD", key: "idCard" },
  { value: "PASSPORT", key: "passport" },
  { value: "DRIVING_LICENSE", key: "license" },
]

export function IdentityStep({ form, set, errors, disabled }: StepProps) {
  const t = useT()
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="firstName"
          label={t("register.identity.firstName")}
          error={errors.includes("firstName") ? t("register.identity.required") : undefined}
        >
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            autoComplete="given-name"
            disabled={disabled}
          />
        </Field>
        <Field
          id="lastName"
          label={t("register.identity.lastName")}
          error={errors.includes("lastName") ? t("register.identity.required") : undefined}
        >
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            autoComplete="family-name"
            disabled={disabled}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="email" label={t("register.identity.email")}>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            disabled={disabled}
          />
        </Field>
        <Field id="phone" label={t("register.identity.phone")}>
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            autoComplete="tel"
            placeholder="+216…"
            disabled={disabled}
          />
        </Field>
      </div>

      {/* L'e-mail et le téléphone sont des IDENTIFIANTS DE CONNEXION non modifiables ensuite
          (D-049) : le dire ICI, au moment de la saisie, est le seul instant où l'information
          est utile — après, il est trop tard. */}
      <p
        className={cn(
          "flex gap-2 rounded-lg px-3 py-2 text-xs",
          errors.includes("contact")
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground",
        )}
        role={errors.includes("contact") ? "alert" : undefined}
      >
        <Info className="mt-px size-4 shrink-0" aria-hidden />
        <span>{t("register.identity.contactNotice")}</span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="idDocumentType">{t("register.identity.docType")}</Label>
          <Select
            value={form.idDocumentType}
            onValueChange={(value) => set("idDocumentType", value as IdDocumentType)}
            disabled={disabled}
          >
            <SelectTrigger id="idDocumentType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ID_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {t(`register.identity.doc.${type.key}` as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field
          id="idDocumentNumber"
          label={t("register.identity.docNumber")}
          error={
            errors.includes("idDocumentNumber") ? t("register.identity.required") : undefined
          }
        >
          <Input
            id="idDocumentNumber"
            value={form.idDocumentNumber}
            onChange={(e) => set("idDocumentNumber", e.target.value)}
            autoComplete="off"
            disabled={disabled}
          />
        </Field>
      </div>

      {/* D-050 : l'IMAGE n'est plus demandée ici. Le dire évite que l'affilié cherche un
          champ de dépôt qui n'existe pas, ou croie son dossier incomplet. */}
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        {t("register.identity.photoLater")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="password"
          label={t("register.identity.password")}
          hint={t("register.identity.passwordHint")}
          error={errors.includes("password") ? t("register.identity.passwordTooShort") : undefined}
        >
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="new-password"
            disabled={disabled}
          />
        </Field>
        <Field
          id="passwordConfirm"
          label={t("register.identity.passwordConfirm")}
          error={
            errors.includes("passwordConfirm") ? t("register.identity.passwordMismatch") : undefined
          }
        >
          <Input
            id="passwordConfirm"
            type="password"
            value={form.passwordConfirm}
            onChange={(e) => set("passwordConfirm", e.target.value)}
            autoComplete="new-password"
            disabled={disabled}
          />
        </Field>
      </div>
    </div>
  )
}

// ─────────────────────────── Étape 3 — le placement ───────────────────────────

export function PlacementStep({ form, set, errors, disabled }: StepProps) {
  const t = useT()
  const legs: Array<{ value: Leg; label: string; tone: string }> = [
    { value: "LEFT", label: t("register.placement.left"), tone: "bg-leg-left" },
    { value: "RIGHT", label: t("register.placement.right"), tone: "bg-leg-right" },
  ]

  return (
    <div className="space-y-4">
      {/* LA méprise la plus fréquente du modèle : sponsor ≠ upline de placement. Elle est
          expliquée ICI, au moment exact où l'affilié doit saisir les deux — pas dans une aide
          générale qu'il ne lira jamais. */}
      <div className="rounded-lg border border-highlight-border bg-highlight p-3 text-sm text-highlight-foreground">
        <p className="font-medium">{t("register.placement.helpTitle")}</p>
        <p className="mt-1 text-xs leading-relaxed">{t("register.placement.helpBody")}</p>
      </div>

      <Field
        id="uplineCode"
        label={t("register.placement.uplineLabel")}
        hint={t("register.placement.uplineHint")}
        error={errors.includes("uplineCode") ? t("register.placement.uplineError") : undefined}
      >
        <Input
          id="uplineCode"
          value={form.uplineCode}
          onChange={(e) => set("uplineCode", e.target.value.toUpperCase())}
          placeholder="NP000964"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled}
          className="font-mono tracking-wider"
        />
      </Field>

      <div className="space-y-1.5">
        <Label>{t("register.placement.legLabel")}</Label>
        <div className="grid grid-cols-2 gap-3">
          {legs.map((leg) => (
            <button
              key={leg.value}
              type="button"
              disabled={disabled}
              aria-pressed={form.leg === leg.value}
              onClick={() => set("leg", leg.value)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors",
                form.leg === leg.value
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted",
              )}
            >
              <span aria-hidden className={cn("size-3 rounded-full", leg.tone)} />
              {leg.label}
            </button>
          ))}
        </div>
        {errors.includes("leg") && (
          <p role="alert" className="text-xs text-destructive">
            {t("register.placement.legError")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("register.placement.legHint")}</p>
      </div>
    </div>
  )
}

// ─────────────────────────── Étape 4 — le paiement ───────────────────────────

export function PaymentStep({
  form,
  set,
  errors,
  disabled,
  feeDt,
}: StepProps & { feeDt: string }) {
  const t = useT()
  return (
    <div className="space-y-4">
      <EcardCodesInput
        codes={form.ecardCodes}
        onChange={(codes) => set("ecardCodes", codes)}
        dueDt={feeDt}
        disabled={disabled}
      />
      {errors.includes("ecardCodes") && (
        <p role="alert" className="text-xs text-destructive">
          {t("register.payment.required")}
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
        {/* Pas d'`aria-label` ici : le `<label>` englobant nomme déjà la case. En ajouter un
            faisait annoncer le texte DEUX FOIS par un lecteur d'écran. */}
        <Checkbox
          checked={form.termsAccepted}
          onCheckedChange={(checked) => set("termsAccepted", checked === true)}
          disabled={disabled}
        />
        <span className="text-sm leading-relaxed">{t("register.payment.terms")}</span>
      </label>
      {errors.includes("terms") && (
        <p role="alert" className="text-xs text-destructive">
          {t("register.payment.termsRequired")}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────── Récapitulatif ───────────────────────────

/**
 * Ce que l'affilié va soumettre, relu avant l'envoi.
 *
 * NI le mot de passe, NI les codes d'e-card n'y figurent en clair : le premier n'a aucune
 * raison de se réafficher, et les seconds sont de la valeur au porteur — les remettre à
 * l'écran, sur un formulaire potentiellement rempli en public, serait un recul. On confirme
 * leur NOMBRE, ce qui suffit à vérifier qu'on n'en a pas oublié une.
 */
export function RegisterSummary({
  form,
  feeDt,
  onEdit,
}: {
  form: RegistrationForm
  feeDt: string
  onEdit: (step: number) => void
}) {
  const t = useT()

  const rows: Array<{ label: string; value: string; step: number }> = [
    { label: t("register.summary.sponsor"), value: form.sponsorCode, step: 0 },
    {
      label: t("register.summary.name"),
      value: `${form.firstName} ${form.lastName}`.trim(),
      step: 1,
    },
    {
      label: t("register.summary.contact"),
      value: [form.email, form.phone].filter(Boolean).join(" · "),
      step: 1,
    },
    { label: t("register.summary.docNumber"), value: form.idDocumentNumber, step: 1 },
    {
      label: t("register.summary.placement"),
      value: `${form.uplineCode} · ${
        form.leg === "LEFT" ? t("register.placement.left") : t("register.placement.right")
      }`,
      step: 2,
    },
    {
      label: t("register.summary.cards"),
      value: t("register.summary.cardCount").replace(
        "{count}",
        String(form.ecardCodes.filter((c) => c.trim().length > 0).length),
      ),
      step: 3,
    },
  ]

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("register.summary.intro")}</p>
      <dl className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className="flex items-center gap-2 text-right text-sm font-medium">
              <span className="break-all">{row.value || "—"}</span>
              <button
                type="button"
                onClick={() => onEdit(row.step)}
                className="shrink-0 text-xs font-normal text-link underline-offset-2 hover:underline"
              >
                {t("register.summary.edit")}
              </button>
            </dd>
          </div>
        ))}
      </dl>
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        {t("register.summary.total")}{" "}
        <strong className="font-semibold">
          <MoneyDt value={feeDt} />
        </strong>
      </p>
    </div>
  )
}
