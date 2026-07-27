import { useEffect, useState } from "react"
import { Link, NavLink } from "react-router"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/use-t"
import { BAR_NAV, SPONSOR_ENTRY } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { AccountMenu } from "./account-menu"
import { Brand } from "./brand"

/**
 * BARRE HORIZONTALE DU PORTAIL — le chrome de l'espace membre (Tranche 9.6).
 *
 * ═══ POURQUOI PLUS DE COLONNE LATÉRALE ═══
 * Une colonne latérale de 256 px qui ne quitte jamais l'écran est le patron du BACK-OFFICE :
 * elle suppose qu'on navigue en permanence, entre des dizaines d'écrans, en travaillant. Un
 * affilié vient voir où il en est sur huit écrans. La colonne lui prenait un cinquième de la
 * largeur pour lui rappeler des adresses qu'il connaît par cœur, et donnait au portail l'allure
 * d'un outil de saisie — le dernier reste du patron admin après la refonte de la Tranche 9.5.
 *
 * ═══ DEUX FORMES, UN SEUL COMPOSANT ═══
 *  — à partir de `lg` : une PILULE FLOTTANTE, bornée en largeur, centrée, détachée du bord haut.
 *    Elle est COLLANTE mais reste DANS LE FLUX (`sticky`, pas `fixed`) : le contenu commence
 *    naturellement sous elle, aucun écran n'a de marge haute à compenser — une marge oubliée
 *    est un titre caché sous la barre ;
 *  — sous `lg` : un en-tête simple et plein cadre. Le téléphone garde sa barre d'onglets BASSE
 *    (`BottomNav`) : y superposer une pilule flottante mangerait de la hauteur pour dupliquer
 *    une navigation déjà atteignable au pouce.
 *
 * ═══ LES LIENS N'ONT PAS D'ICÔNE, ET C'EST UNE MESURE ═══
 * Cinq libellés français (« Mes e-cards », « Mon réseau »), la marque, le bouton d'accent et
 * l'avatar tiennent dans 992 px utiles à 1024 — mais pas avec cinq icônes de plus (~110 px) et
 * le mot-symbole déployé. D'où le monogramme seul sous `xl`. La leçon vient de `tabs.tsx` en
 * Tranche 8b : des libellés français plus longs que prévu avaient cassé la mise en page parce
 * qu'on avait supposé au lieu de mesurer. Les icônes restent là où elles servent VRAIMENT : la
 * barre d'onglets du téléphone, où c'est l'icône qu'on vise, et la feuille « Plus ».
 *
 * ═══ « PARRAINER » EST UN BOUTON ═══
 * C'est l'action commerciale de la plateforme. Rendue comme un sixième lien, elle se lirait
 * comme une adresse parmi d'autres. Elle porte donc l'or PLEIN — et c'est aussi pourquoi le
 * lien ACTIF ne le porte pas (voir `BarLink`) : deux aplats d'or côte à côte rendraient
 * l'appel à l'action indistinguable de l'écran courant.
 */
export function TopBar() {
  const t = useT()
  const scrolled = useScrolled()

  return (
    <div
      className={cn(
        "sticky top-0 z-40 transition-colors duration-200 lg:px-4 lg:py-3",
        // La marge qui détache la pilule du bord haut laisse passer une BANDE de contenu
        // au-dessus d'elle pendant le défilement : à 12 px, on y lit le haut tronqué d'un
        // titre, ce qui se voit comme un défaut d'affichage (constaté en sombre, où le
        // contraste est le plus fort). Un fondu vers le fond de page couvre cette bande sans
        // rendre au chrome la barre pleine largeur qu'on vient de lui retirer.
        scrolled &&
          "lg:bg-gradient-to-b lg:from-background lg:via-background/90 lg:to-transparent",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 transition-[background-color,box-shadow] duration-200",
          // Téléphone : en-tête plein cadre, posé sur le fond de page.
          "border-b bg-background/95 px-4 backdrop-blur",
          // Grand écran : la pilule. Rayon maximal, bornée et centrée, jamais pleine largeur.
          "lg:mx-auto lg:h-16 lg:w-full lg:max-w-5xl lg:rounded-full lg:border-0 lg:px-3",
          // Le traitement au défilement est DISCRET par construction : au repos la pilule est
          // à peine posée sur la page ; défilée, elle s'en détache (voile plus opaque, flou,
          // ombre portée, filet affirmé). Sans cela, le contenu qui passe DERRIÈRE elle la
          // rendrait illisible dès la première ligne de texte.
          "lg:ring-1",
          scrolled
            ? "lg:bg-card/85 lg:shadow-lg lg:ring-border lg:backdrop-blur-xl"
            : "lg:bg-card/70 lg:shadow-none lg:ring-border/50",
        )}
      >
        <Link
          to="/"
          className="shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={t("app.name")}
        >
          <Brand variant="compact" />
        </Link>

        {/* Les liens, au CENTRE. `mx-auto` sur le groupe plutôt qu'une grille à trois colonnes
            égales : à 1024 px, deux colonnes latérales de même largeur imposeraient au groupe
            de gauche la largeur du groupe de droite (bouton + avatar), et la barre déborderait
            pour une raison purement géométrique. Ici, tout ce qui dépasse se rétrécit. */}
        <nav
          aria-label={t("nav.label")}
          className="mx-auto hidden min-w-0 items-center gap-0.5 lg:flex"
        >
          {BAR_NAV.map((entry) => (
            <BarLink key={entry.path} path={entry.path} label={t(entry.labelKey)} />
          ))}
        </nav>

        <div className="ms-auto flex shrink-0 items-center gap-2 lg:ms-0">
          {/* `nativeButton={false}` : ce bouton EST un lien (`render`). Sans cette précision,
              Base UI avertit qu'on lui retire ses sémantiques natives de bouton — et il a
              raison : un lien se ctrl-clique, s'ouvre dans un onglet, se copie. */}
          <Button
            variant="default"
            size="lg"
            nativeButton={false}
            className="hidden h-10 rounded-full px-4 lg:inline-flex"
            render={<Link to={`/${SPONSOR_ENTRY.path}`} />}
          >
            <UserPlus aria-hidden />
            {t(SPONSOR_ENTRY.labelKey)}
          </Button>

          <AccountMenu />
        </div>
      </div>
    </div>
  )
}

/**
 * Un lien de la barre. L'état actif se lit sur TROIS signaux simultanés — surface dorée diluée,
 * graisse, couleur de texte pleine — parce qu'un seul ne suffit pas : la graisse seule ne se
 * voit qu'en comparant, et une teinte seule disparaît pour qui distingue mal les couleurs.
 * L'aplat d'or PLEIN, lui, est réservé au bouton « Parrainer ».
 */
function BarLink({ path, label }: { path: string; label: string }) {
  return (
    <NavLink
      to={`/${path}`}
      end={path === ""}
      className={({ isActive }) =>
        cn(
          "rounded-full px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          isActive
            ? "bg-primary/12 font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      {label}
    </NavLink>
  )
}

/**
 * « La page a-t-elle défilé ? » — la seule chose que la barre a besoin de savoir.
 *
 * Écouteur PASSIF (le navigateur n'a donc pas à attendre le gestionnaire pour défiler) et état
 * BOOLÉEN, pas une position : reposer le même `false` à chaque pixel provoquerait un rendu par
 * image de défilement, sur un composant qui enveloppe toute l'application.
 */
function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const read = () => setScrolled(window.scrollY > threshold)
    read() // une page rouverte à mi-hauteur (retour arrière du navigateur) démarre défilée
    window.addEventListener("scroll", read, { passive: true })
    return () => window.removeEventListener("scroll", read)
  }, [threshold])

  return scrolled
}
