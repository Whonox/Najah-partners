import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/use-t"

/**
 * Pagination « précédent / page X sur Y / suivant ».
 *
 * Elle était recopiée à l'identique sur « Mes gains » et « Mes commandes ». Deux copies d'un
 * contrôle de navigation, c'est deux endroits où corriger un défaut d'accessibilité — et le
 * second qu'on oublie. Elle disparaît d'elle-même quand il n'y a qu'une page : afficher un
 * « 1 sur 1 » encadré de deux boutons éteints occupe de la place pour ne rien dire.
 */
export function Pager({
  page,
  pages,
  onChange,
}: {
  page: number
  pages: number
  onChange: (page: number) => void
}) {
  const t = useT()
  if (pages <= 1) return null

  return (
    <nav aria-label={t("action.pagination")} className="flex items-center justify-between gap-3 pt-4">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft />
        {t("action.previous")}
      </Button>

      {/* `aria-live` : sans lui, changer de page ne produit AUCUNE annonce — la liste se
          remplace en silence et l'on ne sait pas si le clic a fait quelque chose. */}
      <span aria-live="polite" className="text-sm text-muted-foreground">
        {t("action.page", { page, pages })}
      </span>

      <Button
        variant="outline"
        size="sm"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        {t("action.next")}
        <ChevronRight />
      </Button>
    </nav>
  )
}
