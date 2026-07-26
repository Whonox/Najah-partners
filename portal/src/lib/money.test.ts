import { describe, expect, it } from "vitest"
import { fromMillimes, sumMillimes, toMillimes } from "./money"

/**
 * ARITHMÉTIQUE EN MILLIMES — le calcul le plus dangereux du portail, parce qu'il se trompe
 * SANS RIEN CASSER.
 *
 * Ces fonctions décident du message « il vous manque X » / « le compte est exact » affiché
 * avant un paiement par e-card. Une erreur ici ne lève aucune exception et n'affiche rien de
 * bizarre : elle dit simplement à l'affilié qu'il lui manque 0,000 DT sur un paiement pourtant
 * juste, ou l'inverse. C'est exactement le genre de défaut que ni le backend (qui recalcule
 * tout de son côté) ni un passage au navigateur ne rattrapent — d'où ces tests.
 */

describe("toMillimes — du décimal vers l'entier", () => {
  it("découpe la chaîne au lieu de multiplier un flottant", () => {
    // 0.1 × 1000 vaut 100.00000000000001 en flottant. Le découpage de chaîne, lui, est exact.
    expect(toMillimes("0.1")).toBe(100)
    expect(toMillimes("2100.000")).toBe(2_100_000)
    expect(toMillimes("45")).toBe(45_000)
  })

  it("complète les décimales manquantes et tronque au-delà du millime", () => {
    expect(toMillimes("1.5")).toBe(1500)
    expect(toMillimes("1.05")).toBe(1050)
    // Le millime est la plus petite unité (ledger.md) : le reste est coupé, jamais arrondi —
    // arrondir ferait diverger l'affichage du montant que le backend, lui, refuse.
    expect(toMillimes("1.2349")).toBe(1234)
  })

  it("accepte la virgule décimale, qu'un affilié tapera un jour", () => {
    expect(toMillimes("12,500")).toBe(12_500)
  })

  it("rend 0 sur une valeur illisible, jamais NaN", () => {
    // Un NaN propagé contamine tout l'écran en « — » sans qu'on sache d'où il vient.
    for (const bad of ["", "abc", "12.5.3", "1e3", null, undefined]) {
      expect(toMillimes(bad)).toBe(0)
    }
  })

  it("gère le signe", () => {
    expect(toMillimes("-3.250")).toBe(-3250)
  })
})

describe("fromMillimes — de l'entier vers l'affichage", () => {
  it("rend toujours trois décimales", () => {
    expect(fromMillimes(2_100_000)).toBe("2100.000")
    expect(fromMillimes(50)).toBe("0.050")
    expect(fromMillimes(5)).toBe("0.005")
    expect(fromMillimes(0)).toBe("0.000")
  })

  it("gère le signe sans perdre les décimales", () => {
    expect(fromMillimes(-1250)).toBe("-1.250")
  })

  it("fait l'aller-retour sans dérive", () => {
    for (const amount of ["0.001", "45.000", "2100.000", "8350.750"]) {
      expect(fromMillimes(toMillimes(amount))).toBe(amount)
    }
  })
})

describe("sumMillimes — la règle de couverture exacte (D-030)", () => {
  it("additionne sans jamais traverser un flottant", () => {
    // Le cas qui motive tout le module : 0.1 + 0.2 vaut 0.30000000000000004 en flottant.
    expect(sumMillimes(["0.1", "0.2"])).toBe(300)
  })

  it("plusieurs e-cards cumulées tombent exactement sur le montant dû", () => {
    // Scénario réel d'activation Silver : 2200 − 100 d'acompte = 2100 (D-029 + D-037).
    expect(sumMillimes(["1500.000", "600.000"])).toBe(toMillimes("2100.000"))
  })

  it("une carte illisible vaut 0 et ne fait pas basculer la somme en NaN", () => {
    expect(sumMillimes(["100.000", "oups"])).toBe(100_000)
  })

  it("une liste vide vaut 0", () => {
    expect(sumMillimes([])).toBe(0)
  })
})
