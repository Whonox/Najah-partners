import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyDt } from "@/components/format/amount"
import { useT } from "@/i18n/use-t"

/** Plafond de sécurité du backend (D-040) : dix cartes par paiement, pas une de plus. */
const MAX_CARDS = 10

/**
 * SAISIE MUETTE DE CODES D'E-CARD — la variante du formulaire PUBLIC d'inscription (D-052).
 *
 * ═══ CE COMPOSANT NE VÉRIFIE RIEN, ET C'EST TOUT SON INTÉRÊT ═══
 * Son jumeau `EcardPayment` vérifie chaque code à la frappe et annonce « il vous manque
 * 300,000 DT » avant l'envoi. C'est excellent — sur un écran AUTHENTIFIÉ, où tout
 * tâtonnement est nominatif et traçable.
 *
 * Ici, non. L'inscription est PUBLIQUE et ANONYME (D-021), et elle consomme de la VALEUR
 * (D-036). Un retour immédiat sur un code saisi ferait de ce formulaire un ORACLE : n'importe
 * qui pourrait énumérer l'espace des codes depuis la page d'accueil et apprendre, sans
 * compte, lesquels existent, lesquels sont déjà utilisés, et combien ils valent. Le backend
 * s'y refuse délibérément — il n'existe aucun endpoint public de vérification, et son message
 * d'erreur d'inscription est volontairement INDISTINCT. Reproduire la vérification côté
 * écran rendrait cette précaution sans objet.
 *
 * D'où : aucune requête pendant la saisie, aucune valeur affichée, aucun total calculé,
 * aucun « il vous manque ». Le seul retour possible arrive à la SOUMISSION, et c'est celui du
 * serveur, tel quel.
 *
 * ═══ CE QU'ON PEUT DIRE SANS RIEN RÉVÉLER ═══
 * Le montant DÛ (100 DT), qui est un tarif public ; le nombre de cartes saisies ; le plafond
 * de dix. Aucune de ces informations ne dépend d'un code — elles ne fuient rien.
 *
 * ═══ NE PAS « AMÉLIORER » CE COMPOSANT ═══
 * Y ajouter un jour la vérification à la saisie, ou un total, rouvrirait exactement la faille
 * que D-052 ferme. Si le besoin se fait sentir, c'est la décision qu'il faut rouvrir.
 */
export function EcardCodesInput({
  codes,
  onChange,
  dueDt,
  disabled,
}: {
  codes: string[]
  onChange: (codes: string[]) => void
  /** Montant dû — un TARIF public (D-036), pas une information dérivée d'un code. */
  dueDt: string
  disabled?: boolean
}) {
  const t = useT()

  function setAt(index: number, value: string) {
    // Normalisation d'affichage seulement : majuscules et tirets, comme le format imprimé sur
    // la carte (XXX-XXX-XXX-XXX). Aucune validation — la forme n'est pas jugée ici.
    const next = [...codes]
    next[index] = value.toUpperCase()
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-muted px-3 py-2.5 text-sm">
        {t("register.payment.due")}{" "}
        <strong className="font-semibold">
          <MoneyDt value={dueDt} />
        </strong>
      </div>

      <div className="space-y-2">
        {codes.map((code, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`ecard-code-${index}`} className="text-xs text-muted-foreground">
                {t("register.payment.cardLabel")} {index + 1}
              </Label>
              <Input
                id={`ecard-code-${index}`}
                value={code}
                onChange={(event) => setAt(index, event.target.value)}
                placeholder="XXX-XXX-XXX-XXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={disabled}
                className="font-mono tracking-wider"
              />
            </div>
            {codes.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => onChange(codes.filter((_, i) => i !== index))}
                aria-label={`${t("register.payment.removeCard")} ${index + 1}`}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {codes.length < MAX_CARDS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...codes, ""])}
        >
          <Plus className="size-4" />
          {t("register.payment.addCard")}
        </Button>
      )}

      <p className="text-xs text-muted-foreground">{t("register.payment.hint")}</p>
    </div>
  )
}
