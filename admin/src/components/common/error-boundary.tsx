import { Component, type ErrorInfo, type ReactNode } from "react"
import { RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/use-t"

/**
 * Filet de sécurité d'ÉCRAN. React démonte tout l'arbre quand un rendu lève : sans limite, une
 * carte qui tombe emporte la page, la barre latérale et l'en-tête — l'admin se retrouve devant
 * une fenêtre blanche, sans même un moyen de changer de module. C'est exactement ce que
 * produisait un montant absent dans un snapshot d'activation.
 *
 * La limite est posée AUTOUR de la zone de travail, pas autour de l'application : la
 * navigation survit, et l'admin peut aller ailleurs. Elle ne remplace évidemment pas la
 * correction du bug — elle en borne le rayon.
 *
 * Elle est écrite en CLASSE parce que c'est encore la seule forme que React reconnaisse comme
 * limite d'erreur : il n'existe pas de hook équivalent.
 */
class ErrorBoundaryInner extends Component<
  { children: ReactNode; fallback: (reset: () => void) => ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // La console est le seul journal dont on dispose côté back-office. La trace complète y
    // reste lisible pour le développeur ; l'écran, lui, n'affiche jamais de pile d'appels.
    console.error("Écran interrompu par une erreur de rendu", error, info)
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(() => this.setState({ error: null }))
    }
    return this.props.children
  }
}

/** Message affiché à la place de l'écran tombé. Sobre : ce qui compte est que le reste marche. */
function CrashFallback({ onRetry }: { onRetry: () => void }) {
  const t = useT()

  return (
    <Alert variant="destructive">
      <AlertTitle>{t("state.crashTitle")}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{t("state.crashBody")}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          {t("state.crashRetry")}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundaryInner
      fallback={(reset) => <CrashFallback onRetry={reset} />}
    >
      {children}
    </ErrorBoundaryInner>
  )
}
