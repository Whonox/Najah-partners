import { useState } from "react"
import { Check, Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Notice } from "@/components/common/explain"
import { MoneyDt } from "@/components/format/amount"
import { apiClient } from "@/api/client"
import { unwrap } from "@/api/error"
import { fromMillimes, sumMillimes, toMillimes } from "@/lib/money"
import { useT } from "@/i18n/use-t"

/** Plafond de sécurité du backend (D-040) : dix cartes par paiement, pas une de plus. */
const MAX_CARDS = 10

interface PaymentCard {
  code: string
  /** Valeur confirmée par la vérification. `null` tant qu'on ne l'a pas, ou si le code est refusé. */
  valueDt: string | null
  state: "checking" | "valid" | "invalid"
  reason?: string
}

/**
 * COMPOSER UN PAIEMENT PAR E-CARDS — le composant partagé par les trois montants dus
 * (activation, achat libre, renouvellement).
 *
 * ═══ POURQUOI VÉRIFIER CHAQUE CODE À LA SAISIE ═══
 * La règle est une COUVERTURE EXACTE (D-030) : la somme des cartes doit égaler le montant dû
 * au millime, ni plus ni moins. Sans vérification, l'affilié saisirait ses codes à l'aveugle et
 * découvrirait le refus après l'envoi, sans savoir laquelle des cinq cartes pose problème.
 * Chaque code ajouté est donc vérifié (route authentifiée, sans consommation) et affiche sa
 * valeur : l'écran peut alors dire « il vous manque 300,000 DT » AVANT d'envoyer quoi que ce
 * soit.
 *
 * Cela ne DÉCIDE rien : le backend revérifie tout sous verrou et reste seul juge. Une carte
 * peut être consommée ailleurs entre la vérification et l'envoi — c'est exactement pourquoi
 * l'autorité ne peut pas être ici.
 *
 * L'arithmétique passe par des MILLIMES ENTIERS (`lib/money.ts`) : comparer des flottants
 * ferait afficher « il manque 0,000 DT » sur un paiement juste.
 */
export function EcardPayment({
  dueDt,
  codes,
  onChange,
  disabled,
}: {
  /** Montant dû, tel que le backend l'impose (chaîne décimale). */
  dueDt: string
  codes: string[]
  onChange: (codes: string[]) => void
  disabled?: boolean
}) {
  const t = useT()
  const [cards, setCards] = useState<PaymentCard[]>([])
  const [input, setInput] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  const dueMillimes = toMillimes(dueDt)
  const coveredMillimes = sumMillimes(cards.map((card) => card.valueDt))
  const gap = dueMillimes - coveredMillimes
  const allChecked = cards.length > 0 && cards.every((card) => card.state === "valid")
  const exact = allChecked && gap === 0

  async function addCode() {
    const code = input.trim().toUpperCase()
    setLocalError(null)
    if (code === "") return

    if (codes.includes(code)) {
      // Un doublon compterait deux fois la valeur d'une seule carte : le backend le refuse
      // (D-030), autant le dire tout de suite plutôt qu'après un aller-retour.
      setLocalError(t("payment.duplicate"))
      return
    }
    if (codes.length >= MAX_CARDS) {
      setLocalError(t("payment.maxCards"))
      return
    }

    setInput("")
    onChange([...codes, code])
    setCards((current) => [...current, { code, valueDt: null, state: "checking" }])

    try {
      const result = await unwrap(await apiClient.POST("/ecards/verify", { body: { code } }))
      setCards((current) =>
        current.map((card) =>
          card.code === code
            ? {
                code,
                valueDt: result.valid ? result.valueDt : null,
                state: result.valid ? "valid" : "invalid",
                reason: result.reason ?? undefined,
              }
            : card,
        ),
      )
    } catch {
      setCards((current) =>
        current.map((card) =>
          card.code === code ? { code, valueDt: null, state: "invalid" } : card,
        ),
      )
    }
  }

  function removeCode(code: string) {
    onChange(codes.filter((existing) => existing !== code))
    setCards((current) => current.filter((card) => card.code !== code))
    setLocalError(null)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ecard-code-input">{t("payment.addCode")}</Label>
        <div className="flex gap-2">
          <Input
            id="ecard-code-input"
            value={input}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder={t("payment.codePlaceholder")}
            className="font-mono tracking-wider"
            onChange={(event) => setInput(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void addCode()
              }
            }}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label={t("payment.addCode")}
            disabled={disabled || input.trim() === ""}
            onClick={() => void addCode()}
          >
            <Plus />
          </Button>
        </div>
        {localError ? <p className="text-sm text-destructive">{localError}</p> : null}
      </div>

      {cards.length > 0 ? (
        <ul className="space-y-2">
          {cards.map((card) => (
            <li
              key={card.code}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
            >
              <span className="flex-1 truncate font-mono text-sm tracking-wider">
                {card.code}
              </span>

              {card.state === "checking" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : card.state === "valid" ? (
                <span className="flex items-center gap-1.5">
                  <Check className="size-4 shrink-0 text-success" aria-hidden />
                  <MoneyDt value={card.valueDt} className="text-sm" />
                </span>
              ) : (
                <span className="text-sm text-destructive">
                  {t("ecardVerify.invalid")}
                </span>
              )}

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("payment.remove")}
                disabled={disabled}
                onClick={() => removeCode(card.code)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{t("payment.due")}</span>
          <MoneyDt value={dueDt} className="font-semibold" />
        </p>
        <p className="mt-1.5 flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{t("payment.covered")}</span>
          <MoneyDt value={fromMillimes(coveredMillimes)} />
        </p>

        <p
          className={
            exact
              ? "mt-2 border-t pt-2 font-medium text-success"
              : "mt-2 border-t pt-2 font-medium text-muted-foreground"
          }
        >
          {exact
            ? t("payment.exact")
            : gap > 0
              ? t("payment.missing", {
                  amount: `${fromMillimes(gap)} ${t("unit.dt")}`,
                })
              : t("payment.excess", {
                  amount: `${fromMillimes(-gap)} ${t("unit.dt")}`,
                })}
        </p>
      </div>

      <Notice>{t("payment.exactRule")}</Notice>
    </div>
  )
}
