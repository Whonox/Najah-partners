import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useT } from "@/i18n/use-t"

/**
 * Confirmation d'une action qui engage de la valeur — thémée, jamais `window.confirm`.
 *
 * Pourquoi pas `window.confirm` : il ne suit pas le thème, ne se traduit pas, et surtout il ne
 * peut pas montrer le RÉCAPITULATIF de ce qu'on s'apprête à faire. Sur un écran où un clic
 * sort de l'argent d'un solde, la confirmation doit dire quoi, combien, et avec quelle
 * conséquence.
 *
 * UN SEUL NIVEAU ici, contrairement au back-office : le portail ne crée jamais de valeur ex
 * nihilo (pas de genèse), il ne fait que DÉPLACER l'argent du membre. Le mot à recopier du
 * back-office n'aurait donc rien à protéger — et une confirmation qu'on ne comprend pas devient
 * un réflexe, c'est-à-dire une protection en moins.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  summary,
  consequence,
  confirmLabel,
  pending = false,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  /** Récapitulatif de l'opération : ce sur quoi elle porte, en clair. */
  summary?: ReactNode
  /** Conséquence, dite avec des mots (« ce montant quitte votre solde immédiatement »). */
  consequence?: string
  confirmLabel: string
  pending?: boolean
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {summary ? (
          <div className="rounded-lg border bg-muted/50 p-3 text-sm">{summary}</div>
        ) : null}

        {consequence ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{consequence}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t("action.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
