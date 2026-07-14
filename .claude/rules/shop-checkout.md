# Règle — Boutique & checkout

> Source : `docs/spec.md` §5.6, §5.7, §7.1.4 ; décisions D-002, D-005, D-006, D-007, D-025, **D-027**. Implémentée en Tranche 6 (`backend/src/shop/`).

## Le montant dû est la somme des BV, et rien d'autre
`dueBv = Σ (valeur BV × quantité)`. N'y entrent JAMAIS :
- les **frais de livraison** — de l'affichage, réglés hors système (espèces), la plateforme n'encaisse rien ;
- une **promotion** — elle baisse le prix DT affiché, la valeur BV ne bouge pas (D-002).

Ce ne sont pas des exclusions par vigilance : le dinar et le BV sont de natures différentes. Le BV est la seule unité transactionnelle. `OrderLine` fige `unitValueBv` (BV) et `unitPriceDt` (prix **effectif** affiché, promo comprise) : revaloriser un produit demain ne réécrit aucune commande passée.

## Deux contextes, une seule règle de paiement
- **ACTIVATION** (membre INSCRIT) : le panier vaut **exactement** le palier du pack (D-006), l'e-card paie ce palier, et l'activation — elle seule — injecte le BV dans l'arbre (D-005). Le palier qui fait foi est celui du **snapshot d'activation** relu sous verrou, jamais le pack vivant : c'est lui que l'e-card a payé et que l'arbre a reçu.
- **LIBRE** (membre ACTIF) : aucun point dans l'arbre, **aucune ligne de grand livre**, aucun BV crédité au membre. L'e-card est brûlée en payant : sa valeur quitte le système (D-025).

Paiement = e-card, valeur **égale exactement** au montant dû, **une seule** par commande (D-007 ; en base : `Order.ecardId` UNIQUE). Aucune passerelle, aucun fiat.

## Atomicité (D-027)
Le checkout ouvre UNE transaction : commande + consommation de l'e-card + activation + propagation d'arbre + stock committent ensemble ou pas du tout. `ActivationService.activateInTx(tx, …)` compose dans cette transaction (Prisma n'imbrique pas les transactions interactives). Un échec, même à la dernière ligne, laisse l'e-card `ACTIVE`, le membre `INSCRIT`, le stock intact et aucune commande orpheline — garanti par le rollback Postgres, jamais par une compensation applicative.

Une commande naît **`PAID`** : sans passerelle, le paiement est instantané ou la transaction n'existe pas (CHECK `Order_paid_ecard_ck`).

## Verrouillage — `Member` → `Ecard` → `Product` → `Order`
Ordre inter-tables du projet (D-024, étendu par D-027). L'activation impose déjà `Member` (chaîne d'ancêtres, ids croissants, `FOR NO KEY UPDATE`) puis `Ecard` ; le **produit vient après** — aucun autre chemin du système ne verrouille un produit, l'ajouter en queue ne peut fermer aucun cycle. Entre deux checkouts aux paniers qui se recoupent, les produits sont verrouillés par **id croissant** : ordre total commun, donc aucun interblocage.

## Stock
- **PHYSIQUE seulement.** VIRTUEL = `stock null` = illimité (`null` ne veut pas dire « inconnu » mais « sans objet » — CHECK `Product_type_stock_ck`).
- Décrément **atomique et gardé**, dans la transaction du checkout : `UPDATE … SET stock = stock - qty WHERE id = ? AND active AND "valueBv" = <snapshot> AND (type = 'VIRTUAL' OR stock >= qty) RETURNING id`. Zéro ligne = rupture ou produit modifié → rollback. Sous concurrence, deux commandes du dernier exemplaire se sérialisent sur le verrou de ligne : **exactement une passe**, jamais de stock négatif.

## Tests attendus
- Activation : panier ≠ palier → refusé ; panier = palier → commande `PAID`, e-card `USED`, membre `ACTIF`, arbre crédité, stock décrémenté.
- Rollback : échec en fin de checkout → e-card `ACTIVE`, membre `INSCRIT`, stock intact, aucune commande.
- Achat libre : e-card = somme exacte → OK, **grand livre inchangé** et arbre inchangé ; valeur ≠ somme → refusé.
- Concurrence : 2 commandes du dernier exemplaire → exactement 1 réussit.
- Frais de livraison jamais dans le montant BV dû ; promo → le BV ne change pas.
