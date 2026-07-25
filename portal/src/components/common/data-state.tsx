import type { ReactNode } from "react"
import { RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/api/error"
import { useT } from "@/i18n/use-t"

/**
 * Patron unique des trois états d'un écran de données : chargement, erreur, vide.
 *
 * Tous les écrans du portail passent par ici — un écran qui invente son propre « Chargement… »
 * est un écran qui divergera. Le TON diffère de celui du back-office : l'affilié n'est pas un
 * technicien, un état vide lui dit ce qu'il peut FAIRE (« parrainez votre premier filleul »)
 * plutôt que de constater l'absence de données.
 */
export function DataState({
  isLoading,
  error,
  isEmpty,
  emptyMessage,
  emptyAction,
  onRetry,
  rows = 3,
  children,
}: {
  isLoading: boolean
  error: unknown
  isEmpty?: boolean
  /** Message d'état vide, propre à l'écran. À défaut, un message générique. */
  emptyMessage?: string
  /** Ce que l'affilié peut faire depuis cet écran vide (bouton, lien). */
  emptyAction?: ReactNode
  onRetry?: () => void
  /** Nombre de blocs fantômes pendant le chargement (à caler sur la densité de l'écran). */
  rows?: number
  children: ReactNode
}) {
  const t = useT()

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label={t("state.loading")}>
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("state.error")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{errorMessage(error)}</span>
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw />
              {t("state.retry")}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          {emptyMessage ?? t("state.empty")}
        </p>
        {emptyAction}
      </div>
    )
  }

  return <>{children}</>
}
