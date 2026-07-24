import type { ReactNode } from "react"
import { RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/api/error"
import { useT } from "@/i18n/use-t"

/**
 * Patron unique des trois états d'un écran de données : chargement, erreur, vide.
 * Tous les modules du back-office passeront par ici — un écran qui invente son propre
 * « Chargement… » est un écran qui divergera.
 */
export function DataState({
  isLoading,
  error,
  isEmpty,
  onRetry,
  rows = 5,
  children,
}: {
  isLoading: boolean
  error: unknown
  isEmpty?: boolean
  onRetry?: () => void
  /** Nombre de lignes fantômes pendant le chargement (à caler sur la densité de l'écran). */
  rows?: number
  children: ReactNode
}) {
  const t = useT()

  if (isLoading) {
    return (
      <div className="space-y-2" role="status" aria-label={t("state.loading")}>
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("state.errorTitle")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{errorMessage(error)}</span>
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw />
              {t("state.errorRetry")}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("state.empty")}
      </div>
    )
  }

  return <>{children}</>
}
