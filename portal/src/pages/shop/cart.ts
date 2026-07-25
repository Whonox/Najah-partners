import type { Product } from "@/api/queries/shop"

/** Le panier : combien d'exemplaires de chaque produit. */
export type Cart = Record<number, number>

/**
 * Les DEUX totaux d'un panier (D-028), qui ne se déduisent JAMAIS l'un de l'autre :
 *  — `totalPoints` : la somme des valeurs BV, qui sert au contrôle du palier en activation ;
 *  — `prices` : les prix unitaires effectifs, un par exemplaire, laissés en CHAÎNES pour être
 *    additionnés en millimes entiers par `lib/money.ts`. Les additionner ici en flottant
 *    ferait diverger le total affiché du total exigé, au millime — et la règle de couverture
 *    exacte (D-030) se joue précisément à ce millime.
 *
 * Aucune de ces valeurs ne décide quoi que ce soit : le backend recalcule tout sous verrou,
 * contre les prix et les points relus au moment de la transaction.
 */
export function cartTotals(products: Product[], cart: Cart) {
  let totalPoints = 0
  const prices: string[] = []
  const lines: Array<{ product: Product; quantity: number }> = []

  for (const product of products) {
    const quantity = cart[product.id] ?? 0
    if (quantity <= 0) continue
    lines.push({ product, quantity })
    totalPoints += product.valueBv * quantity
    const unit = product.promoPriceDt ?? product.priceDt
    for (let index = 0; index < quantity; index += 1) prices.push(unit)
  }

  return { totalPoints, prices, lines }
}
