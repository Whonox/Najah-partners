import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Fil d'étapes, partagé par les TROIS parcours de la Tranche 9.5 : inscription (4 étapes,
 * D-052), première connexion (3 étapes, D-050) et activation (4 étapes).
 *
 * ═══ POURQUOI UN SEUL COMPOSANT ═══
 * Ces trois parcours ont la même promesse pour l'affilié — « voilà où tu en es, voilà ce
 * qu'il reste ». Trois implémentations divergeraient au premier ajustement et donneraient
 * trois sensations différentes dans la même application.
 *
 * ═══ MOBILE D'ABORD : LES LIBELLÉS DISPARAISSENT, PAS LES ÉTAPES ═══
 * À 390 px, quatre libellés côte à côte se chevauchent ou se tronquent. On garde donc les
 * pastilles et la barre de liaison — qui portent l'essentiel, « combien » et « où » — et le
 * libellé de l'étape COURANTE seule, sous le fil. Les autres réapparaissent dès `sm`.
 * Tronquer quatre libellés à trois lettres n'aurait renseigné personne.
 *
 * ═══ CE QU'IL N'EST PAS ═══
 * Pas un système de navigation : cliquer une étape ne la rejoue pas. Un parcours d'inscription
 * ou de paiement se fait dans l'ordre, et laisser revenir en arrière depuis le fil inviterait
 * à sauter la validation d'une étape. `onStepClick` existe pour les cas où le retour est
 * explicitement autorisé (récapitulatif → correction), et rien d'autre.
 */
export interface StepperStep {
  /** Libellé court — deux ou trois mots. Il doit tenir sous une pastille. */
  label: string
}

interface StepperProps {
  steps: readonly StepperStep[]
  /** Index de l'étape courante, à partir de 0. */
  current: number
  /**
   * Autorise le retour vers une étape DÉJÀ franchie. Absent = fil purement indicatif.
   * Jamais vers une étape à venir : on ne saute pas une validation.
   */
  onStepClick?: (index: number) => void
  className?: string
}

export function Stepper({ steps, current, onStepClick, className }: StepperProps) {
  return (
    <nav
      aria-label="Progression"
      className={cn("w-full", className)}
    >
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const done = index < current
          const active = index === current
          const reachable = done && onStepClick !== undefined
          const position = `${index + 1}`

          return (
            <li
              key={step.label}
              className={cn("flex items-center", index < steps.length - 1 && "flex-1")}
            >
              <div className="flex flex-col items-center gap-1.5">
                {/* `button` seulement quand le retour est permis : un `div` cliquable serait
                    invisible au clavier et aux lecteurs d'écran. */}
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(index)}
                    aria-label={`Revenir à l’étape ${position} : ${step.label}`}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                      "border-primary bg-primary text-primary-foreground hover:opacity-90",
                    )}
                  >
                    <Check className="size-4" aria-hidden />
                  </button>
                ) : (
                  <span
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                      done && "border-primary bg-primary text-primary-foreground",
                      active && "border-primary bg-background text-primary",
                      !done && !active && "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-4" aria-hidden /> : position}
                  </span>
                )}

                {/* Sous `sm`, seul le libellé de l'étape courante est rendu : voir l'en-tête. */}
                <span
                  className={cn(
                    "max-w-24 text-center text-xs leading-tight",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                    !active && "hidden sm:block",
                  )}
                >
                  {step.label}
                </span>
              </div>

              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "mx-2 mb-6 h-0.5 flex-1 rounded-full transition-colors",
                    done ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
