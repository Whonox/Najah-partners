import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/use-t"

/**
 * Copier une valeur dans le presse-papiers (code d'e-card, code de parrainage).
 *
 * `navigator.clipboard` N'EST PAS TOUJOURS DISPONIBLE : il exige un contexte sécurisé (HTTPS
 * ou localhost) et peut être refusé par l'utilisateur. Sur un code d'e-card affiché UNE SEULE
 * FOIS, un bouton qui échoue en silence est une valeur perdue — d'où le message explicite qui
 * invite à sélectionner le texte à la main. Le code reste visible à l'écran pendant ce temps :
 * la copie est un confort, jamais le seul moyen de récupérer la valeur.
 */
export function CopyButton({
  value,
  label,
  successMessage,
  iconOnly,
  className,
}: {
  value: string
  label: string
  successMessage?: string
  /**
   * Rend l'icône SEULE, le libellé passant en nom accessible.
   *
   * Utile quand le bouton est collé à ce qu'il copie — dans une puce qui affiche déjà le code
   * membre, « Copier » écrit en toutes lettres redit ce que l'icône dit, et double la largeur
   * d'un élément qui doit tenir sur une ligne à 390 px. Le libellé n'est pas perdu pour
   * autant : il devient `aria-label`, donc lu par un lecteur d'écran et affiché en infobulle.
   */
  iconOnly?: boolean
  className?: string
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(successMessage ?? t("action.copied"))
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t("action.copyFailed"))
    }
  }

  if (iconOnly) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        title={label}
        className={className}
        onClick={() => void copy()}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    )
  }

  return (
    <Button variant="outline" className={className} onClick={() => void copy()}>
      {copied ? <Check /> : <Copy />}
      {label}
    </Button>
  )
}
