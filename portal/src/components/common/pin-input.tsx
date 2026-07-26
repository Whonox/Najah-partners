import { useId, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

/**
 * Saisie d'un code PIN, une case par chiffre (D-050/D-051).
 *
 * ═══ POURQUOI PAS UN SIMPLE CHAMP TEXTE ═══
 * Un PIN se saisit au téléphone, souvent d'une main, parfois en marchant. Les cases séparées
 * donnent trois choses qu'un champ unique ne donne pas : le clavier NUMÉRIQUE s'ouvre tout
 * seul (`inputMode`), la longueur attendue est visible sans la lire, et une faute de frappe
 * se corrige sans tout retaper.
 *
 * ═══ CE QUI EST FACILE À RATER ═══
 *  - `type="password"` sur chaque case : un PIN se saisit en public, il n'a pas à s'afficher ;
 *  - le COLLER doit remplir toutes les cases d'un coup — un gestionnaire de mots de passe
 *    colle la valeur entière dans la première, et sans traitement on n'en garderait qu'un
 *    chiffre ;
 *  - `Backspace` sur une case vide doit reculer, sinon la correction demande de viser
 *    la case précédente au doigt ;
 *  - `autoComplete="one-time-code"` : sans lui, le navigateur propose des mots de passe
 *    enregistrés dans un champ qui n'en attend pas.
 *
 * La valeur est portée par le parent (composant contrôlé) : c'est lui qui la soumet et qui
 * la remet à zéro après un refus.
 */
interface PinInputProps {
  value: string
  onChange: (value: string) => void
  /** Nombre de cases. Le backend accepte 4 à 6 chiffres (D-058). */
  length?: number
  /** Soumission implicite quand la dernière case est remplie. */
  onComplete?: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  label: string
  /** Message d'erreur — lié au groupe par `aria-describedby`. */
  error?: string
  className?: string
}

const DIGITS = /^\d*$/

export function PinInput({
  value,
  onChange,
  length = 4,
  onComplete,
  disabled,
  autoFocus,
  label,
  error,
  className,
}: PinInputProps) {
  const groupId = useId()
  const errorId = `${groupId}-error`
  const refs = useRef<Array<HTMLInputElement | null>>([])

  const digits = Array.from({ length }, (_, i) => value[i] ?? "")

  function commit(next: string) {
    const trimmed = next.slice(0, length)
    onChange(trimmed)
    if (trimmed.length === length) onComplete?.(trimmed)
  }

  function focusAt(index: number) {
    refs.current[Math.max(0, Math.min(length - 1, index))]?.focus()
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    if (!DIGITS.test(raw)) return

    // `maxLength=1` garantit un seul caractère ici : une saisie groupée arrive par le
    // COLLER (`handlePaste`), jamais par ce chemin. On ne tente donc aucune répartition —
    // du code qui ne peut pas s'exécuter finit par mentir sur ce qui est réellement géré.
    if (raw === "") {
      commit(value.slice(0, index))
      return
    }
    const next = value.slice(0, index) + raw + value.slice(index + 1)
    commit(next)
    focusAt(index + 1)
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      if (digits[index] === "") {
        // Case vide : on recule ET on efface le chiffre précédent, ce qui est le geste
        // attendu — sinon il faudrait deux frappes pour corriger une saisie.
        event.preventDefault()
        commit(value.slice(0, Math.max(0, index - 1)))
        focusAt(index - 1)
      }
      return
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      focusAt(index - 1)
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      focusAt(index + 1)
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "")
    if (!pasted) return
    event.preventDefault()
    commit(pasted)
    focusAt(pasted.length)
  }

  return (
    <div className={cn("space-y-2", className)}>
      <span id={groupId} className="block text-sm font-medium">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={groupId}
        aria-describedby={error ? errorId : undefined}
        className="flex gap-2"
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el
            }}
            // `password` et non `text` : un PIN se saisit devant d'autres gens.
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={digit}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            aria-label={`Chiffre ${index + 1}`}
            onChange={(event) => handleChange(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            // Sans cela, retaper sur une case DÉJÀ remplie ne ferait rien (`maxLength=1` est
            // atteint) : l'affilié appuierait sur une touche sans effet visible et croirait
            // le champ bloqué. Sélectionner le contenu fait que la frappe le remplace.
            onFocus={(event) => event.target.select()}
            className={cn(
              "size-12 rounded-lg border bg-background text-center text-lg font-semibold tabular-nums",
              "outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-destructive",
            )}
          />
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
