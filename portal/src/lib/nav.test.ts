import { describe, expect, it } from "vitest"
import {
  ACCOUNT_NAV,
  BAR_NAV,
  MORE_NAV,
  NAV_ENTRIES,
  PRIMARY_NAV,
  SPONSOR_ENTRY,
} from "./nav"

/**
 * La répartition des destinations entre les quatre surfaces du chrome (Tranche 9.6).
 *
 * Ce qu'on teste ici est exactement ce qui se trompe SILENCIEUSEMENT : une entrée qui, à force
 * de filtres, n'apparaîtrait plus nulle part reste une route parfaitement fonctionnelle — le
 * build passe, l'écran s'affiche si l'on tape l'URL, et personne ne remarque qu'aucun lien n'y
 * mène. C'est le seul défaut de ce fichier qui ne se voit ni au navigateur, ni au typecheck.
 */
describe("répartition de la navigation", () => {
  it("place chaque destination sur au moins une surface", () => {
    const reachable = new Set([
      ...BAR_NAV.map((entry) => entry.path),
      ...ACCOUNT_NAV.map((entry) => entry.path),
      ...PRIMARY_NAV.map((entry) => entry.path),
      ...MORE_NAV.map((entry) => entry.path),
      SPONSOR_ENTRY.path,
    ])

    expect([...reachable].sort()).toEqual(NAV_ENTRIES.map((entry) => entry.path).sort())
  })

  it("tient la barre horizontale à cinq liens", () => {
    // Six ne tiennent pas à 1024 px avec des libellés français — c'est une contrainte de
    // largeur mesurée, pas une préférence.
    expect(BAR_NAV).toHaveLength(5)
    expect(BAR_NAV.map((entry) => entry.path)).toEqual([
      "",
      "reseau",
      "boutique",
      "gains",
      "e-cards",
    ])
  })

  it("tient la barre d'onglets du téléphone à quatre cibles", () => {
    // Quatre + « Plus » = cinq cibles d'au moins 44 px. Au-delà, on rate sa cible.
    expect(PRIMARY_NAV).toHaveLength(4)
  })

  it("garde « Parrainer » hors de toute liste de liens", () => {
    // Un appel à l'action rendu comme un lien n'appelle plus rien : il est rendu en BOUTON,
    // dans la barre comme dans la feuille « Plus ».
    expect(SPONSOR_ENTRY.path).toBe("parrainer")
    for (const surface of [BAR_NAV, ACCOUNT_NAV, PRIMARY_NAV, MORE_NAV]) {
      expect(surface).not.toContain(SPONSOR_ENTRY)
    }
  })

  it("ne répète jamais dans « Plus » un onglet de la barre basse", () => {
    // Le recouvrement proscrit depuis la Tranche 9 : voir un écran dans la feuille ET juste en
    // dessous dans la barre ferait douter qu'il s'agit du même.
    const tabs = new Set(PRIMARY_NAV.map((entry) => entry.path))
    expect(MORE_NAV.filter((entry) => tabs.has(entry.path))).toEqual([])
  })

  it("ne déclare aucun chemin en double", () => {
    const paths = NAV_ENTRIES.map((entry) => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
