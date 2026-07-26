import { useState } from "react"
import { Droplet, Leaf, Package, Sparkles } from "lucide-react"
import { apiBaseUrl } from "@/api/client"
import { cn } from "@/lib/utils"

/**
 * Visuel d'un produit : sa photo, ou un placeholder soigné (D-054).
 *
 * ═══ POURQUOI UN PLACEHOLDER ET PAS UN CADRE VIDE ═══
 * Le catalogue n'a aucune photo aujourd'hui (sept produits, zéro image). Une boutique de
 * rectangles gris ne donne envie de rien, et une icône générique répétée sept fois ne
 * distingue pas les produits entre eux. Le placeholder est donc DÉTERMINISTE et porte trois
 * signaux : un dégradé propre à la CATÉGORIE, une icône de famille, et le nom du produit.
 * Deux produits d'une même catégorie se ressemblent — c'est voulu —, deux catégories jamais.
 *
 * ═══ IL DISPARAÎT TOUT SEUL ═══
 * Dès qu'une photo est déposée (T9.5, côté admin), elle remplace le placeholder sans qu'aucun
 * écran ne change. Et si le fichier devient illisible, `onError` fait retomber sur le
 * placeholder plutôt que sur l'icône d'image cassée du navigateur.
 *
 * ═══ L'URL EST CONSTRUITE, PAS STOCKÉE ═══
 * La base ne contient que des chemins relatifs (D-059) ; l'API sert les images par POSITION
 * (`/shop/products/:id/images/:index`). On ne concatène donc jamais un chemin de fichier dans
 * une URL — il n'y a aucun chemin à manipuler côté client.
 */

/**
 * Dégradés par catégorie. Les valeurs sont des CLASSES Tailwind sur des jetons sémantiques :
 * aucune couleur en dur (portal/CLAUDE.md), la palette reste remplaçable depuis `index.css`.
 *
 * La correspondance se fait sur le NOM de catégorie, seul identifiant stable que le portail
 * reçoive — un id changerait au prochain réamorçage. Une catégorie inconnue retombe sur le
 * dégradé neutre, jamais sur du blanc.
 */
const CATEGORY_STYLES: Record<
  string,
  { gradient: string; Icon: typeof Leaf }
> = {
  "Huiles d’olive": {
    gradient: "from-leg-left/25 via-leg-left/10 to-transparent",
    Icon: Droplet,
  },
  "Produits naturels": {
    gradient: "from-success/25 via-success/10 to-transparent",
    Icon: Leaf,
  },
  "Contenus numériques": {
    gradient: "from-leg-right/25 via-leg-right/10 to-transparent",
    Icon: Sparkles,
  },
}

const NEUTRAL = {
  gradient: "from-primary/20 via-primary/5 to-transparent",
  Icon: Package,
}

interface ProductImageProps {
  productId: number
  name: string
  categoryName?: string | null
  /** Nombre d'images du produit — 0 déclenche directement le placeholder, sans requête. */
  imageCount: number
  /** Position de l'image à afficher. La première est celle que l'admin a mise en tête. */
  index?: number
  className?: string
}

export function ProductImage({
  productId,
  name,
  categoryName,
  imageCount,
  index = 0,
  className,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false)
  const style = (categoryName && CATEGORY_STYLES[categoryName]) || NEUTRAL
  const showPhoto = imageCount > index && !failed

  return (
    <div
      className={cn(
        "relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-muted",
        className,
      )}
    >
      {showPhoto ? (
        <img
          src={`${apiBaseUrl}/shop/products/${productId}/images/${index}`}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div
          // `aria-hidden` : le nom du produit est déjà écrit à côté par la carte. Le répéter
          // ferait entendre deux fois la même chose à un lecteur d'écran.
          aria-hidden
          className={cn(
            "flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br p-3 text-center",
            style.gradient,
          )}
        >
          <style.Icon className="size-8 text-foreground/40" />
          <span className="line-clamp-2 text-xs font-medium text-foreground/60">
            {name}
          </span>
        </div>
      )}
    </div>
  )
}
