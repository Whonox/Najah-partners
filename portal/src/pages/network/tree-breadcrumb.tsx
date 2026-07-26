import { ChevronRight, Home } from "lucide-react"
import { useT } from "@/i18n/use-t"
import { cn } from "@/lib/utils"

export interface TreeCrumb {
  id: number
  label: string
}

/**
 * FIL D'ARIANE DES ANCÊTRES — le chemin de descente, qui sert à remonter.
 *
 * ═══ POURQUOI IL EST CONSTRUIT PAR LA DESCENTE, ET NON DEMANDÉ AU SERVEUR ═══
 * Le contrat ne rend que des DESCENDANTS (`GET /members/me/tree` part de moi et descend). Les
 * ancêtres d'un nœud ne sont exposés nulle part — et c'est cohérent avec D-055 : un affilié
 * n'a pas à interroger la chaîne au-dessus de quelqu'un. Le chemin affiché ici est donc
 * exactement celui que l'affilié vient de PARCOURIR, empilé à chaque recentrage. Il ne prétend
 * pas être la généalogie complète, il est un historique de navigation — ce qui suffit à ce
 * qu'on lui demande : revenir en arrière sans repartir de zéro.
 *
 * ═══ POURQUOI PAS UN SIMPLE « RETOUR À MOI » ═══
 * C'est ce qu'il y avait, et cela suffisait à deux niveaux. Dès qu'on descend trois ou quatre
 * fois, revenir à la racine oblige à refaire toute la descente pour explorer la branche
 * voisine. Le fil rend chaque étape cliquable : on remonte d'un cran, pas de tout.
 *
 * ═══ IL SE TRONQUE PAR LA GAUCHE ═══
 * À 390 px, six niveaux ne tiennent pas. On garde toujours la racine (« Moi », le point de
 * repère) et les deux derniers crans — ceux qui servent réellement —, et l'on marque
 * l'élision. Tronquer par la droite aurait masqué où l'on se trouve.
 */
const VISIBLE_TAIL = 2

export function TreeBreadcrumb({
  path,
  onNavigate,
}: {
  /** Chemin parcouru depuis moi, hors racine. Vide = je regarde ma propre position. */
  path: TreeCrumb[]
  /** `null` = revenir à moi ; sinon, remonter à ce nœud (on tronque le chemin après lui). */
  onNavigate: (index: number | null) => void
}) {
  const t = useT()

  if (path.length === 0) return null

  const elided = path.length > VISIBLE_TAIL
  const visible = elided ? path.slice(-VISIBLE_TAIL) : path
  const offset = path.length - visible.length

  return (
    <nav aria-label={t("tree.breadcrumb")} className="flex flex-wrap items-center gap-1">
      <Crumb label={t("tree.me")} icon onClick={() => onNavigate(null)} />

      {elided && (
        <>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="px-1 text-xs text-muted-foreground" aria-hidden>
            …
          </span>
        </>
      )}

      {visible.map((crumb, index) => {
        const absolute = offset + index
        const isCurrent = absolute === path.length - 1
        return (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <Crumb
              label={crumb.label}
              current={isCurrent}
              // Le dernier cran EST la vue courante : le rendre cliquable promettrait un
              // déplacement qui n'aurait pas lieu.
              onClick={isCurrent ? undefined : () => onNavigate(absolute)}
            />
          </span>
        )
      })}
    </nav>
  )
}

function Crumb({
  label,
  icon,
  current,
  onClick,
}: {
  label: string
  icon?: boolean
  current?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      {icon && <Home className="size-3.5" aria-hidden />}
      <span className="max-w-32 truncate">{label}</span>
    </>
  )

  if (!onClick) {
    return (
      <span
        aria-current={current ? "page" : undefined}
        className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-medium"
      >
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors",
        "text-link hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {content}
    </button>
  )
}
