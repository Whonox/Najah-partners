# Règle — Boutique & checkout

> Source : `docs/spec.md` §5.6, §5.7, §7.1.4 ; décisions D-002, D-005, D-006, D-007, D-025, **D-027**, **D-028**, **D-029**. Implémentée en Tranche 6 (`backend/src/shop/`), unité corrigée en Tranche 6.5.

## Deux dimensions, deux montants (D-028)
Le panier produit deux totaux qui ne se déduisent PAS l'un de l'autre :
- `totalPoints = Σ (valeur BV × quantité)` — **POINTS**, sert au contrôle du palier (activation) ;
- `totalDt = Σ (prix effectif × quantité)` — **DINARS**, le prix des produits du panier.

Le montant **payé** (`Order.totalDt`) dépend du contexte (voir plus bas). Les deux totaux sont
figés sur la commande (`Order.totalDt`, `Order.totalPoints`) ; chaque `OrderLine` fige
`unitValueBv` (points) ET `unitPriceDt` (prix effectif, promo comprise) — revaloriser un produit
demain ne réécrit aucune commande passée.

## Ce qui n'entre JAMAIS dans le montant DT dû
- les **frais de livraison** — de l'affichage, réglés hors système (espèces), la plateforme n'encaisse rien ;
- une **promotion sur les points** — une promo baisse le prix DT, la valeur BV (points) ne bouge pas (D-002).

## Deux contextes, une seule règle de paiement
- **ACTIVATION** (membre INSCRIT) : le panier vaut **exactement** le palier du pack **en points** (D-006) ; le montant **payé** est le **PRIX DU PACK en DT** (D-029), *pas* la somme des prix des produits du panier. L'e-card vaut ce prix. L'activation — elle seule — injecte les **points** du palier dans l'arbre (D-005). Le palier qui fait foi est celui du **snapshot d'activation** relu sous verrou, jamais le pack vivant : c'est lui que l'arbre a reçu.
- **LIBRE** (membre ACTIF) : le montant dû = **somme des prix DT** du panier. Aucun point dans l'arbre, **aucune ligne de grand livre**, aucun solde crédité au membre. L'e-card est brûlée en payant : sa valeur quitte le système (D-025).

Paiement = e-card, valeur (en DT) **égale exactement** au montant dû, **une seule** par commande (D-007 ; en base : `Order.ecardId` UNIQUE). Aucune passerelle, aucun fiat.

## Atomicité (D-027)
Le checkout ouvre UNE transaction : commande + consommation de l'e-card + activation + propagation d'arbre + stock committent ensemble ou pas du tout. `ActivationService.activateInTx(tx, …)` compose dans cette transaction (Prisma n'imbrique pas les transactions interactives). Un échec, même à la dernière ligne, laisse l'e-card `ACTIVE`, le membre `INSCRIT`, le stock intact et aucune commande orpheline — garanti par le rollback Postgres, jamais par une compensation applicative.

Une commande naît **`PAID`** : sans passerelle, le paiement est instantané ou la transaction n'existe pas (CHECK `Order_paid_ecard_ck`).

## Verrouillage — `Member` → `Ecard` → `Product` → `Order`
Ordre inter-tables du projet (D-024, étendu par D-027). L'activation impose déjà `Member` (chaîne d'ancêtres, ids croissants, `FOR NO KEY UPDATE`) puis `Ecard` ; le **produit vient après** — aucun autre chemin du système ne verrouille un produit, l'ajouter en queue ne peut fermer aucun cycle. Entre deux checkouts aux paniers qui se recoupent, les produits sont verrouillés par **id croissant** : ordre total commun, donc aucun interblocage.

## Stock
- **PHYSIQUE seulement.** VIRTUEL = `stock null` = illimité (`null` ne veut pas dire « inconnu » mais « sans objet » — CHECK `Product_type_stock_ck`).
- Décrément **atomique et gardé**, dans la transaction du checkout. La garde épingle les **deux dimensions** du produit — sinon un produit modifié entre le chiffrage et le décrément ferait payer l'e-card au mauvais prix, ou composer un palier faux :
  `UPDATE … SET stock = stock - qty WHERE id = ? AND active AND "valueBv" = <snapshot points> AND COALESCE("promoPriceDt","priceDt") = <snapshot prix> AND (type = 'VIRTUAL' OR stock >= qty) RETURNING id`.
  Zéro ligne = rupture ou produit modifié → rollback. Sous concurrence, deux commandes du dernier exemplaire se sérialisent sur le verrou de ligne : **exactement une passe**, jamais de stock négatif.

## Tests attendus
- Activation : panier ≠ palier (points) → refusé ; e-card ≠ prix du pack → refusé ; panier = palier ET e-card = prix → commande `PAID` (`totalDt` = prix du pack, `totalPoints` = palier), e-card `USED`, membre `ACTIF`, arbre crédité en points, stock décrémenté.
- Rollback : échec en fin de checkout → e-card `ACTIVE`, membre `INSCRIT`, stock intact, aucune commande.
- Achat libre : e-card = somme exacte des prix DT → OK, **grand livre inchangé** et arbre inchangé ; valeur ≠ somme → refusé.
- Concurrence : 2 commandes du dernier exemplaire → exactement 1 réussit.
- Frais de livraison jamais dans le montant DT dû ; promo → le prix effectif fait foi, les points ne changent pas.
- Aucune ligne de code ne mélange points et dinars.
