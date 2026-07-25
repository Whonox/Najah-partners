import { useState, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/use-t"

/**
 * Confirmation d'une action IRRÉVERSIBLE — thémée, jamais `window.confirm`.
 *
 * Pourquoi pas `window.confirm` (qui traînait dans la suppression de catégorie, T8b) : il ne
 * suit pas le thème, ne se traduit pas, tronque un texte long, n'accepte aucune mise en forme
 * — et surtout il ne peut pas montrer le RÉCAPITULATIF de ce qu'on s'apprête à faire. Sur une
 * plateforme où un clic peut créer de l'argent, la confirmation doit dire quoi, sur qui,
 * combien, et avec quelle conséquence.
 *
 * DEUX NIVEAUX, calés sur la gravité RÉELLE et non sur l'habitude :
 *  — `normal` : l'action est nommée avec sa conséquence, un bouton suffit (avancer une
 *    expédition, révoquer une e-card, valider un renouvellement) ;
 *  — `reinforced` : il faut RECOPIER un mot avant que le bouton s'active. Réservé à ce qui
 *    fabrique de la valeur ex nihilo (genèse de solde, genèse d'e-card). Le geste n'est pas là
 *    pour ralentir : il empêche le clic réflexe sur le bouton d'un dialogue qui ressemble à
 *    tous les autres.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  /** Récapitulatif de l'opération : ce sur quoi porte l'action, en clair. */
  summary,
  /** Conséquence, dite avec des mots (« la valeur est recréditée au créateur »). */
  consequence,
  confirmLabel,
  level = "normal",
  /** Mot à recopier en mode renforcé. Ignoré sinon. */
  confirmWord,
  pending = false,
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  summary?: ReactNode
  consequence?: string
  confirmLabel: string
  level?: "normal" | "reinforced"
  confirmWord?: string
  pending?: boolean
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  const [typed, setTyped] = useState("")

  const word = confirmWord ?? t("confirm.word")
  const reinforced = level === "reinforced"
  // Comparaison insensible à la casse et aux espaces : on vérifie une INTENTION, pas une dictée.
  const unlocked = !reinforced || typed.trim().toUpperCase() === word.toUpperCase()

  function close() {
    setTyped("")
    onCancel()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {summary ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">{summary}</div>
        ) : null}

        {consequence ? (
          <Alert variant={reinforced ? "destructive" : "default"}>
            <AlertTriangle />
            <AlertDescription>{consequence}</AlertDescription>
          </Alert>
        ) : null}

        {reinforced ? (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-word">
              {t("confirm.typeToConfirm")} <span className="font-mono">{word}</span>
            </Label>
            <Input
              id="confirm-word"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!unlocked || pending}
            onClick={onConfirm}
          >
            {pending ? t("common.pending") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
