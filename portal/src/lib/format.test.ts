import { describe, expect, it } from "vitest"
import { ABSENT, formatDt, formatPoints } from "./format"

/**
 * ESPACE FINE INSÉCABLE (U+202F) — le séparateur de milliers du français.
 *
 * Elle est écrite en ÉCHAPPEMENT et jamais collée telle quelle dans une chaîne : à l'œil, elle
 * est indiscernable d'une espace ordinaire, et un test qui comparerait la mauvaise des deux
 * échouerait sans qu'on comprenne pourquoi. C'est exactement ce qui est arrivé à la première
 * version de ce fichier.
 */
const THIN = "\u202f"

/**
 * FORMATAGE DES DEUX DIMENSIONS (D-028) — ce qui rend un point impossible à confondre avec un
 * dinar, à l'écran.
 *
 * L'invariant du modèle est « aucune conversion nulle part ». À l'affichage, il se traduit par
 * une différence VISUELLE qui doit tenir sans le mot d'unité à côté : un dinar porte toujours
 * trois décimales, un point n'en porte jamais. Si `formatPoints` laissait passer une décimale,
 * « 1 000,5 pts » se lirait comme un montant — et c'est précisément la confusion que tout le
 * modèle s'efforce d'éviter.
 *
 * Ces fonctions sont aussi l'ENTONNOIR de tout l'affichage chiffré : une exception ici ne
 * casse pas une cellule, elle démonte l'arbre React entier. D'où les cas limites, qui valent
 * autant que les cas nominaux.
 */

describe("formatDt — les dinars portent TOUJOURS trois décimales", () => {
  it("complète et groupe les milliers", () => {
    expect(formatDt("2100")).toBe(`2${THIN}100,000`)
    expect(formatDt("45")).toBe("45,000")
    expect(formatDt("0.05")).toBe("0,050")
  })

  it("tronque au-delà du millime, sans arrondir", () => {
    // Arrondir ferait afficher un montant que le backend n'accepterait pas.
    expect(formatDt("1.2349")).toBe("1,234")
  })

  it("utilise la virgule décimale française", () => {
    // Le défaut inverse — un point — se lit « cent trente mille » sur « 130.000 DT ».
    expect(formatDt("130")).toContain(",")
    expect(formatDt("130")).not.toContain(".")
  })

  it("groupe par une espace fine insécable, jamais une espace ordinaire", () => {
    // Une espace ordinaire laisserait « 2 » en fin de ligne et « 100,000 » à la suivante.
    expect(formatDt("2100")).toBe(`2${THIN}100,000`)
  })

  it("garde le signe", () => {
    expect(formatDt("-49.9")).toBe("-49,900")
  })

  it("rend « — » pour une valeur absente, et ne lève jamais", () => {
    expect(formatDt(null)).toBe(ABSENT)
    expect(formatDt(undefined)).toBe(ABSENT)
    expect(formatDt("")).toBe(ABSENT)
    expect(formatDt("   ")).toBe(ABSENT)
    expect(formatDt(Number.NaN)).toBe(ABSENT)
    expect(formatDt(Number.POSITIVE_INFINITY)).toBe(ABSENT)
  })

  it("rend une valeur illisible telle quelle plutôt que déformée", () => {
    expect(formatDt("N/A")).toBe("N/A")
  })
})

describe("formatPoints — les points n'ont JAMAIS de décimale", () => {
  it("groupe les milliers et reste entier", () => {
    expect(formatPoints(1000)).toBe(`1${THIN}000`)
    expect(formatPoints("4000")).toBe(`4${THIN}000`)
    expect(formatPoints(250)).toBe("250")
  })

  it("coupe toute décimale qui arriverait par erreur", () => {
    // C'est LA garantie visuelle : un point affiché avec une décimale se lirait comme un
    // montant. Une donnée de travers ne doit pas produire cette confusion.
    expect(formatPoints("1000.5")).toBe(`1${THIN}000`)
  })

  it("rend « — » pour une valeur absente", () => {
    expect(formatPoints(null)).toBe(ABSENT)
    expect(formatPoints(undefined)).toBe(ABSENT)
  })
})

describe("un point et un dinar ne se ressemblent jamais", () => {
  it("le même nombre brut donne deux rendus distincts", () => {
    // Sans le mot d'unité, on doit encore pouvoir dire lequel est de l'argent.
    expect(formatDt("1000")).toBe(`1${THIN}000,000`)
    expect(formatPoints("1000")).toBe(`1${THIN}000`)
    expect(formatDt("1000")).not.toBe(formatPoints("1000"))
  })
})
