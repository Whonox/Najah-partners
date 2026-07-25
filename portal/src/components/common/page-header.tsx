import type { ReactNode } from "react"

/**
 * En-tête d'écran : titre, phrase d'accroche, actions.
 *
 * Plus AÉRÉ que celui du back-office (portal/CLAUDE.md) : le portail est un espace personnel,
 * pas un tableau de saisie. Sur 390 px, les actions passent SOUS le titre plutôt que de le
 * compresser — un titre tronqué pour laisser tenir un bouton est un mauvais échange.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      ) : null}
    </header>
  )
}
