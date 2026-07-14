-- Tranche 6 — Boutique & checkout (spec §5.6, §5.7, §7.1.4 ; D-002, D-005, D-006, D-007, D-025).

-- ─────────────────────────── Commande ───────────────────────────
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3);

-- Une e-card règle AU PLUS une commande (D-007 : usage unique, une seule e-card par
-- transaction). L'unicité vit en base : le passage ACTIVE → USED l'assure déjà en code,
-- cet index le rend impossible à contourner (import, script, futur module).
CREATE UNIQUE INDEX "Order_ecardId_key" ON "Order"("ecardId");
CREATE INDEX "Order_context_idx" ON "Order"("context");
CREATE INDEX "Order_shipmentStatus_idx" ON "Order"("shipmentStatus");

-- Un produit = une ligne (les quantités sont fusionnées au checkout).
CREATE UNIQUE INDEX "OrderLine_orderId_productId_key" ON "OrderLine"("orderId", "productId");

-- Liste boutique / vitrine.
CREATE INDEX "Product_active_visibleOnSite_idx" ON "Product"("active", "visibleOnSite");

-- ─────────────────────────── Invariants en base ───────────────────────────
-- Mêmes raisons que `Ecard_origin_creator_ck` (T5) : ces règles portent de la VALEUR. Les
-- services les valident déjà ; la base les rend indémontables par un script, un import ou un
-- module futur qui écrirait sans passer par eux.

-- Un produit sans BV serait gratuit dans l'unité transactionnelle (D-002 : seul le BV compte).
ALTER TABLE "Product" ADD CONSTRAINT "Product_value_bv_ck" CHECK ("valueBv" > 0);

-- Stock : PHYSICAL en a un (jamais négatif), VIRTUAL est illimité et n'en a donc AUCUN.
-- `stock IS NULL` pour un VIRTUAL n'est pas « inconnu » : c'est « sans objet ».
ALTER TABLE "Product" ADD CONSTRAINT "Product_type_stock_ck" CHECK (
  ("type" = 'PHYSICAL' AND "stock" IS NOT NULL AND "stock" >= 0)
  OR ("type" = 'VIRTUAL' AND "stock" IS NULL)
);

-- Montants DT = affichage seul (D-002), mais un prix négatif ou une « promo » supérieure au
-- prix de référence n'aurait aucun sens pour l'acheteur.
ALTER TABLE "Product" ADD CONSTRAINT "Product_price_ck" CHECK (
  "priceDt" >= 0
  AND "shippingFeeDt" >= 0
  AND ("promoPriceDt" IS NULL OR ("promoPriceDt" >= 0 AND "promoPriceDt" <= "priceDt"))
);

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_quantity_ck" CHECK (
  "quantity" > 0 AND "unitValueBv" > 0 AND "unitPriceDt" >= 0
);

ALTER TABLE "Order" ADD CONSTRAINT "Order_total_bv_ck" CHECK ("totalBv" > 0);

-- Aucun achat n'échappe au paiement : une commande PAID a forcément brûlé une e-card
-- (D-007, D-025 — zéro fiat, l'e-card est le SEUL instrument de paiement).
ALTER TABLE "Order" ADD CONSTRAINT "Order_paid_ecard_ck" CHECK (
  "status" <> 'PAID' OR "ecardId" IS NOT NULL
);
