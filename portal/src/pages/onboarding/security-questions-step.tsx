import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/api/client"
import type { components } from "@/api/generated/schema"
import { errorMessage, unwrap } from "@/api/error"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/i18n/use-t"
import { SECURITY_QUESTION_LABEL } from "@/lib/security-questions"

/**
 * Étape 2 — les trois questions secrètes (D-050).
 *
 * ═══ TROIS QUESTIONS DIFFÉRENTES, IMPOSÉ À L'ÉCRAN AUSSI ═══
 * Le backend refuse un doublon (contrainte d'unicité par membre). L'interface l'empêche en
 * amont : une question déjà choisie disparaît des autres listes. Laisser choisir puis refuser
 * serait une frustration gratuite — et le motif du refus (« trois fois la même ne protégerait
 * rien ») se comprend mieux avant qu'après.
 *
 * ═══ CE QU'ON DIT SUR LA NORMALISATION ═══
 * « Les majuscules, les accents et les espaces n'ont pas d'importance » — parce que c'est
 * vrai (la réponse est normalisée avant hachage) et parce que le membre doit pouvoir répondre
 * dans un an sans se demander s'il avait mis une capitale. Ce qui compte, en revanche, c'est
 * la ponctuation : on ne le dit pas ici pour ne pas noyer le message, la règle affichée
 * couvre les cas réels.
 *
 * ═══ POURQUOI L'AVERTISSEMENT SUR LE RECOURS ═══
 * Ces réponses sont le SEUL moyen de réinitialiser un PIN oublié : aucun canal e-mail ni SMS
 * n'existe (D-011). Un membre qui bâcle cette étape se prive de son unique filet — il faut
 * qu'il le sache maintenant, pas le jour où il aura oublié son PIN.
 */
const REQUIRED = 3

/** Clé de question, TYPE GÉNÉRÉ depuis l'OpenAPI — jamais recopiée à la main (CLAUDE.md). */
type SecurityAnswerKey = components["schemas"]["SecurityAnswerDto"]["questionKey"]

export function SecurityQuestionsStep({
  onDone,
  onError,
}: {
  onDone: () => void
  onError: (message: string | null) => void
}) {
  const t = useT()
  const [picks, setPicks] = useState<Array<{ questionKey: string; answer: string }>>(
    Array.from({ length: REQUIRED }, () => ({ questionKey: "", answer: "" })),
  )
  const [busy, setBusy] = useState(false)

  const catalog = useQuery({
    queryKey: ["onboarding", "security-questions"],
    queryFn: async () =>
      unwrap(await apiClient.GET("/members/me/onboarding/security-questions")),
    staleTime: Infinity,
  })

  const keys = catalog.data?.keys ?? []

  function update(index: number, patch: Partial<{ questionKey: string; answer: string }>) {
    setPicks((current) =>
      current.map((pick, i) => (i === index ? { ...pick, ...patch } : pick)),
    )
    onError(null)
  }

  /** Les clés retenues ailleurs disparaissent de cette liste : pas de doublon possible. */
  function availableFor(index: number): string[] {
    const taken = new Set(
      picks.filter((_, i) => i !== index).map((p) => p.questionKey).filter(Boolean),
    )
    return keys.filter((key) => !taken.has(key))
  }

  const complete = picks.every(
    (pick) => pick.questionKey !== "" && pick.answer.trim().length >= 2,
  )

  async function submit() {
    setBusy(true)
    onError(null)
    try {
      await unwrap(
        await apiClient.POST("/members/me/onboarding/security-questions", {
          // Le contrat type `questionKey` comme l'UNION des clés du catalogue. Ici la valeur
          // vient de ce même catalogue, lu à l'exécution : TypeScript ne peut pas le savoir,
          // d'où la conversion. Une clé inconnue serait de toute façon refusée par le serveur.
          body: {
            answers: picks.map((p) => ({
              questionKey: p.questionKey as SecurityAnswerKey,
              answer: p.answer.trim(),
            })),
          },
        }),
      )
      onDone()
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("onboarding.questions.intro")}</p>

      <div className="rounded-lg border border-highlight-border bg-highlight p-3 text-xs leading-relaxed text-highlight-foreground">
        {t("onboarding.questions.recourseNotice")}
      </div>

      {picks.map((pick, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`question-${index}`}>
              {t("onboarding.questions.questionLabel")} {index + 1}
            </Label>
            <Select
              value={pick.questionKey}
              // Le composant peut rendre `null` (désélection) ; ici, une question désélectionnée
              // revient à un choix vide — le bouton de soumission reste alors désactivé.
              onValueChange={(value) => update(index, { questionKey: value ?? "" })}
              disabled={busy || catalog.isPending}
            >
              <SelectTrigger id={`question-${index}`}>
                <SelectValue placeholder={t("onboarding.questions.choose")} />
              </SelectTrigger>
              <SelectContent>
                {availableFor(index).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SECURITY_QUESTION_LABEL[key] ?? key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`answer-${index}`}>{t("onboarding.questions.answerLabel")}</Label>
            <Input
              id={`answer-${index}`}
              value={pick.answer}
              onChange={(event) => update(index, { answer: event.target.value })}
              disabled={busy || pick.questionKey === ""}
              autoComplete="off"
            />
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">{t("onboarding.questions.caseHint")}</p>

      <Button className="w-full" disabled={!complete || busy} onClick={() => void submit()}>
        {busy ? t("onboarding.questions.saving") : t("onboarding.questions.submit")}
      </Button>
    </div>
  )
}
