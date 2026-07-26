import { describe, expect, it } from "vitest"
import { cartTotals, type Cart } from "./cart"
import type { Product } from "@/api/queries/shop"

/**
 * COMPOSITION DU PANIER — les DEUX totaux qui ne se déduisent JAMAIS l'un de l'autre (D-028).
 *
 * C'est le seul calcul du portail où les deux dimensions se côtoient dans la même fonction, et
 * donc le seul endroit où elles pourraient se mélanger. Un panier d'activation est refusé si sa
 * somme de POINTS ne tombe pas exactement sur le palier ; le montant en DINARS, lui, ne dépend
 * pas des produits choisis. Les tests ci-dessous fixent cette indépendance.
 *
 * Les prix restent des CHAÎNES jusqu'au bout (`lib/money` les additionne en millimes) : les
 * additionner ici en flottant ferait diverger le total affiché du total exigé, au millime — et
 * la règle de couverture exacte (D-030) se joue précisément à ce millime.
 */

function product(over: Partial<Product> & { id: number }): Product {
  return {
    name: `Produit ${over.id}`,
    description: null,
    categoryId: 1,
    priceDt: "10.000",
    valueBv: 100,
    type: "PHYSICAL",
    stock: 50,
    shippingFeeDt: "5.000",
    promoPriceDt: null,
    imageCount: 0,
    active: true,
    visibleOnSite: true,
    ...over,
  } as Product
}

describe("cartTotals — deux dimensions, jamais mélangées", () => {
  it("additionne les points et laisse les prix en chaînes", () => {
    const products = [
      product({ id: 1, valueBv: 250, priceDt: "42.000" }),
      product({ id: 2, valueBv: 500, priceDt: "88.000" }),
    ]
    const cart: Cart = { 1: 2, 2: 1 }

    const totals = cartTotals(products, cart)

    expect(totals.totalPoints).toBe(1000) // 250 × 2 + 500
    // Un prix par EXEMPLAIRE : c'est ce que `sumMillimes` attend, et cela évite une
    // multiplication en flottant sur une chaîne décimale.
    expect(totals.prices).toEqual(["42.000", "42.000", "88.000"])
  })

  it("compose exactement un palier Silver (1 000 points)", () => {
    const products = [
      product({ id: 1, valueBv: 250 }),
      product({ id: 2, valueBv: 500 }),
    ]
    expect(cartTotals(products, { 1: 2, 2: 1 }).totalPoints).toBe(1000)
  })

  it("une PROMO baisse le prix retenu et ne touche pas aux points (D-002)", () => {
    const products = [product({ id: 1, valueBv: 500, priceDt: "190.000", promoPriceDt: "169.000" })]

    const totals = cartTotals(products, { 1: 1 })

    expect(totals.prices).toEqual(["169.000"]) // le prix EFFECTIF
    expect(totals.totalPoints).toBe(500) // inchangé
  })

  it("ignore les quantités nulles ou négatives", () => {
    const products = [product({ id: 1 }), product({ id: 2 })]

    const totals = cartTotals(products, { 1: 0, 2: -3 })

    expect(totals.lines).toEqual([])
    expect(totals.totalPoints).toBe(0)
    expect(totals.prices).toEqual([])
  })

  it("ignore un produit du panier qui n'est plus au catalogue", () => {
    // Cas réel : un produit désactivé entre le chargement de la page et l'ajout au panier.
    // Il ne doit ni faire planter le total, ni y contribuer — le backend le refuserait de
    // toute façon, mais l'écran ne doit pas afficher un palier atteint à tort.
    const totals = cartTotals([product({ id: 1, valueBv: 250 })], { 1: 1, 999: 4 })

    expect(totals.totalPoints).toBe(250)
    expect(totals.lines).toHaveLength(1)
  })

  it("les FRAIS DE LIVRAISON n'entrent dans aucun des deux totaux", () => {
    // La plateforme ne les encaisse pas : ils se règlent au livreur (shop-checkout.md).
    const products = [product({ id: 1, priceDt: "42.000", shippingFeeDt: "5.000" })]

    const totals = cartTotals(products, { 1: 1 })

    expect(totals.prices).toEqual(["42.000"])
    expect(totals.prices.join()).not.toContain("5.000")
  })

  it("l'ordre des lignes suit le CATALOGUE, pas l'ordre d'ajout", () => {
    // Le récapitulatif doit se lire dans le même ordre que la grille qu'on vient de parcourir.
    const products = [product({ id: 7 }), product({ id: 3 })]

    const totals = cartTotals(products, { 3: 1, 7: 1 })

    expect(totals.lines.map((line) => line.product.id)).toEqual([7, 3])
  })
})
