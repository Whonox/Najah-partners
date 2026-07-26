import { useState } from "react"

/**
 * L'ÉTAT d'un parcours par étapes — le compagnon de `<Stepper>`, écrit une fois pour les trois
 * parcours qui en ont un (inscription, première connexion, activation).
 *
 * ═══ POURQUOI IL A SON PROPRE FICHIER ═══
 * Il vivait dans `pages/register/use-registration.ts` tant qu'un seul écran en avait besoin ;
 * l'importer depuis la boutique aurait fait dépendre le parcours d'achat du module
 * d'inscription. Le poser à côté de `<Stepper>` était le réflexe suivant — mais un fichier qui
 * exporte un composant ne doit exporter QUE des composants, sinon le rafraîchissement rapide
 * de Vite remonte le module entier à chaque frappe et perd l'état de l'écran en cours. D'où un
 * fichier séparé, sans JSX.
 *
 * Les bornes sont tenues ICI (`Math.min`/`Math.max`) : un appelant qui se trompe d'index
 * n'affiche pas une étape inexistante, il reste sur la dernière. Aucune règle métier, aucun
 * effet de bord — c'est un compteur borné, et il se teste comme tel.
 */
export function useStepper(total: number) {
  const [current, setCurrent] = useState(0)
  return {
    current,
    isLast: current === total - 1,
    next: () => setCurrent((c) => Math.min(total - 1, c + 1)),
    back: () => setCurrent((c) => Math.max(0, c - 1)),
    goTo: (index: number) => setCurrent(Math.max(0, Math.min(total - 1, index))),
    reset: () => setCurrent(0),
  }
}
