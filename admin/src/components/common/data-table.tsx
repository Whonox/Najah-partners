import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TableHead } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/use-t"

/**
 * Briques communes aux tables du back-office (§7.2.2, §7.2.4 à §7.2.6). Le registre est
 * celui d'un OUTIL DE TRAVAIL : dense, lisible à vingt lignes, sans décoration
 * (admin/CLAUDE.md). Aucune couleur en dur — que des variables sémantiques.
 */

/**
 * Coque d'une table : la carte, et le débordement HORIZONTAL confiné à l'intérieur. Sans ce
 * `overflow-x-auto`, une table large pousse toute la page en défilement horizontal — et
 * l'admin perd la navigation en même temps que la lisibilité.
 */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <Card className="p-0">
      <CardContent className="overflow-x-auto p-0">{children}</CardContent>
    </Card>
  )
}

export type SortDirection = "asc" | "desc"

/**
 * En-tête CLIQUABLE. Le tri se fait côté serveur (`sort` + `direction`) : trier une page de
 * 20 lignes en mémoire donnerait un ordre faux dès la page 2, puisqu'il ne verrait pas les
 * 4 000 autres membres.
 */
export function SortableHead<TField extends string>({
  field,
  active,
  direction,
  onSort,
  className,
  children,
}: {
  field: TField
  active: TField | undefined
  direction: SortDirection
  onSort: (field: TField) => void
  className?: string
  children: ReactNode
}) {
  const t = useT()
  const isActive = active === field

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={t("table.sortBy")}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {children}
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    </TableHead>
  )
}

/**
 * Pagination. On affiche le TOTAL et non seulement « page 2 / 7 » : sur une liste filtrée,
 * le nombre de résultats est l'information que l'admin cherche en premier (« combien de
 * membres gelés ? »), souvent sans avoir besoin d'ouvrir une seule fiche.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}) {
  const t = useT()
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <span aria-live="polite">
        {t("table.rangeStart")} {first}–{last} {t("table.rangeOf")} {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
          {t("table.previous")}
        </Button>
        <span className="tabular-nums">
          {page} / {lastPage}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          {t("table.next")}
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

/** Barre de filtres : même gabarit sur les quatre listes, et repliable en colonne sous `sm`. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
      {children}
    </div>
  )
}

/** Un filtre = un libellé au-dessus de son contrôle, largeur contenue. */
export function FilterField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  )
}
