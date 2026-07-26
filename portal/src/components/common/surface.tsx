import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * LA SURFACE — l'unique endroit où se décide à quoi ressemble un bloc de contenu du portail.
 *
 * ═══ POURQUOI CE COMPOSANT EXISTE ═══
 * Le registre validé en Tranche 9.5 (accueil, puis boutique) est une suite de surfaces posées
 * sur le fond, à grands rayons, avec des respirations généreuses — l'inverse des cartes
 * cerclées et denses du back-office. Il était écrit à la main, à peu près, dans une quinzaine
 * de fichiers : `rounded-2xl bg-card p-5` ici, `rounded-xl border p-4` là, et déjà deux
 * variantes divergentes entre l'accueil (sans filet) et la boutique (avec filet). Une
 * apparence répétée à la main est une apparence qui dérive.
 *
 * ═══ FILET OU PAS : LA RÈGLE, ET SA RAISON ═══
 * Ce n'est pas une préférence, c'est une question d'ADJACENCE.
 *
 *  — `panel` (défaut) : un bloc SEUL sur sa ligne, séparé du suivant par du vide. Le fond de
 *    page (`background`) et la surface (`card`) suffisent à le détacher ; un filet en plus
 *    ramènerait le registre « formulaire administratif » que la Tranche 9.5 corrige.
 *
 *  — `card` : un bloc dans une GRILLE ou une liste, collé à ses voisins. Là, le contraste de
 *    fond ne suffit plus : sans limite, trois cartes de produits côte à côte se lisent comme
 *    une seule zone. D'où le filet — non par décoration, mais parce que l'œil a besoin de
 *    savoir où finit un produit et où commence le suivant.
 *
 *  — `highlight` : la surface dorée du portail, réservée aux chiffres qui portent l'identité
 *    (solde, gains, code membre). Rare par construction : tout mettre en avant n'avance rien.
 *
 * ═══ CE QU'ELLE NE FAIT PAS ═══
 * Aucune logique, aucun état, aucune sémantique. Elle rend un `div` (ou l'élément demandé) :
 * un panneau qui est une SECTION doit le dire lui-même via `as="section"`, et son titre
 * reste à sa charge — une surface ne sait pas ce qu'elle contient.
 */
export function Surface({
  children,
  variant = "panel",
  padding = "default",
  as: Tag = "div",
  className,
}: {
  children: ReactNode
  variant?: "panel" | "card" | "highlight"
  /** `none` quand le contenu gère lui-même ses marges (une vignette qui touche les bords). */
  padding?: "default" | "compact" | "roomy" | "none"
  as?: "div" | "section" | "li" | "article"
  className?: string
}) {
  return (
    <Tag
      className={cn(
        "rounded-2xl",
        variant === "panel" && "bg-card",
        variant === "card" && "bg-card ring-1 ring-border",
        variant === "highlight" &&
          "bg-highlight text-highlight-foreground ring-1 ring-highlight-border",
        padding === "compact" && "p-4",
        padding === "default" && "p-4 sm:p-5",
        padding === "roomy" && "p-5 sm:p-7",
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/**
 * En-tête d'une surface : un titre, éventuellement une action à droite et une phrase dessous.
 *
 * Il existe parce que le même trio se réécrivait sur chaque écran, avec des tailles de titre
 * qui divergeaient d'un fichier à l'autre — `text-base` ici, `text-lg` là, pour le même niveau
 * de hiérarchie. Le niveau de balise reste réglable (`level`) : la hiérarchie du DOCUMENT ne
 * doit pas dépendre de la taille du texte.
 */
export function SurfaceHeader({
  title,
  description,
  action,
  level = 2,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  level?: 2 | 3
  className?: string
}) {
  const Heading = level === 2 ? "h2" : "h3"

  return (
    <div className={cn("mb-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Heading className="text-base font-semibold">{title}</Heading>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
