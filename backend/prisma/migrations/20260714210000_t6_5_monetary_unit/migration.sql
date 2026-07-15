-- Tranche 6.5 — Refactor d'unité monétaire (D-028, D-029 ; révise D-002).
--
-- Le plan de rémunération était libellé en BV faute de confirmation (encadré « [À CONFIRMER] »
-- de la spec §5.1). La cliente a tranché : ces montants sont des DINARS. Le modèle a donc DEUX
-- dimensions qui ne se croisent JAMAIS — aucune conversion n'existe nulle part :
--
--   POINTS (Int)            : composer le panier au palier d'un pack, alimenter les jambes de
--                             l'arbre. Un point ne vaut jamais de l'argent.
--   DINARS (numeric(12,3))  : TOUT l'argent — solde, e-cards, grand livre, commissions,
--                             plafond hebdomadaire, prix. Le millime = 3 décimales.
--
-- Cette migration RENOMME et CASTE en place. Elle ne convertit rien : les valeurs existantes
-- sont du nominal de développement (un solde de 1000 BV devient 1000.000 DT), sans autre
-- signification. En dev : `prisma migrate reset` puis reseed pour repartir sur des montants
-- justes (packs recalés sur la table cliente).
--
-- Écrite à la main : `prisma migrate diff` aurait DROP/CREATE la table et l'enum du grand
-- livre — donc détruit l'historique des mouvements — au lieu de les renommer.

-- ─────────────────────────── Grand livre : BV → DT ───────────────────────────
-- Le grand livre est le journal des SOLDES. Les soldes sont en dinars : son nom cesse de
-- mentir. Les valeurs de l'enum sont inchangées (et toujours PAS d'ECARD_USE — D-025).
ALTER TYPE "BvMovementType" RENAME TO "LedgerMovementType";

ALTER TABLE "BvLedgerEntry" RENAME TO "LedgerEntry";
ALTER TABLE "LedgerEntry" RENAME CONSTRAINT "BvLedgerEntry_pkey" TO "LedgerEntry_pkey";
ALTER TABLE "LedgerEntry" RENAME CONSTRAINT "BvLedgerEntry_memberId_fkey" TO "LedgerEntry_memberId_fkey";
ALTER TABLE "LedgerEntry" RENAME CONSTRAINT "BvLedgerEntry_ecardId_fkey" TO "LedgerEntry_ecardId_fkey";
ALTER TABLE "LedgerEntry" RENAME CONSTRAINT "BvLedgerEntry_commissionId_fkey" TO "LedgerEntry_commissionId_fkey";
ALTER INDEX "BvLedgerEntry_memberId_idx" RENAME TO "LedgerEntry_memberId_idx";
ALTER INDEX "BvLedgerEntry_memberId_createdAt_idx" RENAME TO "LedgerEntry_memberId_createdAt_idx";
ALTER SEQUENCE "BvLedgerEntry_id_seq" RENAME TO "LedgerEntry_id_seq";

ALTER TABLE "LedgerEntry" RENAME COLUMN "amountBv" TO "amountDt";
ALTER TABLE "LedgerEntry" RENAME COLUMN "balanceAfter" TO "balanceAfterDt";
ALTER TABLE "LedgerEntry"
  ALTER COLUMN "amountDt" TYPE DECIMAL(12,3) USING "amountDt"::numeric(12,3),
  ALTER COLUMN "balanceAfterDt" TYPE DECIMAL(12,3) USING "balanceAfterDt"::numeric(12,3);

-- ─────────────────────────── Member : le portefeuille est en dinars ───────────────────────────
ALTER TABLE "Member" RENAME COLUMN "bvBalance" TO "balanceDt";
ALTER TABLE "Member"
  ALTER COLUMN "balanceDt" TYPE DECIMAL(12,3) USING "balanceDt"::numeric(12,3),
  ALTER COLUMN "balanceDt" SET DEFAULT 0;

-- Invariant n°1 du grand livre : un solde ne devient JAMAIS négatif. Le service le tient déjà
-- sous verrou de ligne ; le CHECK le rend indémontable même par un script, un import ou un
-- module futur qui écrirait sans passer par lui.
ALTER TABLE "Member" ADD CONSTRAINT "Member_balance_dt_ck" CHECK ("balanceDt" >= 0);

-- Les colonnes de POINTS (baseline*, *Points, startupBonusRemaining, activationTierBv) restent
-- des entiers : elles ne changent NI de nom NI de type. C'est tout l'objet de la décision.

-- ─────────────────────────── Pack : palier en points, plan de rémunération en dinars ──────────
ALTER TABLE "Pack" RENAME COLUMN "refPriceDt" TO "priceDt"; -- « prix de référence » → prix PAYÉ (D-029)
ALTER TABLE "Pack" RENAME COLUMN "directCommissionBv" TO "directCommissionDt";
ALTER TABLE "Pack" RENAME COLUMN "indirectCommissionBv" TO "indirectCommissionDt";
ALTER TABLE "Pack" RENAME COLUMN "weeklyCapBv" TO "weeklyCapDt";
ALTER TABLE "Pack"
  ALTER COLUMN "directCommissionDt" TYPE DECIMAL(12,3) USING "directCommissionDt"::numeric(12,3),
  ALTER COLUMN "indirectCommissionDt" TYPE DECIMAL(12,3) USING "indirectCommissionDt"::numeric(12,3),
  ALTER COLUMN "weeklyCapDt" TYPE DECIMAL(12,3) USING "weeklyCapDt"::numeric(12,3);
-- `tierBv` reste INTEGER : le palier est en POINTS.

-- ─────────────────────────── E-card : un instrument de paiement porte de l'argent ─────────────
ALTER TABLE "Ecard" RENAME COLUMN "valueBv" TO "valueDt";
ALTER TABLE "Ecard" ALTER COLUMN "valueDt" TYPE DECIMAL(12,3) USING "valueDt"::numeric(12,3);

-- Une e-card de valeur nulle ou négative ne paierait rien : elle n'a pas de sens comme
-- instrument de paiement (et sa création débite le créateur de ce montant).
ALTER TABLE "Ecard" ADD CONSTRAINT "Ecard_value_dt_ck" CHECK ("valueDt" > 0);

-- ─────────────────────────── Commissions (Tranche 7) : des dinars ─────────────────────────────
ALTER TABLE "Commission" RENAME COLUMN "amountBv" TO "amountDt";
ALTER TABLE "Commission" RENAME COLUMN "appliedCapBv" TO "appliedCapDt";
ALTER TABLE "Commission"
  ALTER COLUMN "amountDt" TYPE DECIMAL(12,3) USING "amountDt"::numeric(12,3),
  ALTER COLUMN "appliedCapDt" TYPE DECIMAL(12,3) USING "appliedCapDt"::numeric(12,3);

ALTER TABLE "CommissionRun" RENAME COLUMN "distributedBv" TO "distributedDt";
ALTER TABLE "CommissionRun"
  ALTER COLUMN "distributedDt" TYPE DECIMAL(12,3) USING "distributedDt"::numeric(12,3),
  ALTER COLUMN "distributedDt" SET DEFAULT 0;

-- ─────────────────────────── Commande : le payé (DT) et le panier (points) ────────────────────
-- Les deux totaux ne se déduisent PAS l'un de l'autre :
--   `totalDt`     = ce que l'e-card a couvert exactement — prix du PACK en ACTIVATION (D-029),
--                   Σ des prix effectifs en LIBRE ;
--   `totalPoints` = Σ (valeur BV × quantité) — en ACTIVATION, la preuve figée que le panier
--                   faisait exactement le palier, et ce que l'arbre a reçu.
ALTER TABLE "Order" RENAME COLUMN "totalBv" TO "totalPoints";
ALTER TABLE "Order" ADD COLUMN "totalDt" DECIMAL(12,3);

-- Reprise des commandes existantes (dev) : le montant payé valait alors la somme des BV, et
-- l'e-card était libellée dans la même unité. On reprend donc la valeur de l'e-card qui a
-- réellement payé — c'est le montant historiquement dû, sans invention de taux.
UPDATE "Order" o SET "totalDt" = COALESCE(
  (SELECT e."valueDt" FROM "Ecard" e WHERE e."id" = o."ecardId"),
  o."totalPoints"::numeric(12,3)
);
ALTER TABLE "Order" ALTER COLUMN "totalDt" SET NOT NULL;

ALTER TABLE "Order" DROP CONSTRAINT "Order_total_bv_ck";
ALTER TABLE "Order" ADD CONSTRAINT "Order_total_ck" CHECK ("totalDt" > 0 AND "totalPoints" > 0);

-- `OrderLine.unitValueBv` (POINTS) et `unitPriceDt` (DINARS) sont inchangés : la ligne portait
-- déjà les deux dimensions. Seul le SENS de `unitPriceDt` change (transactionnel en achat
-- libre, et non plus « affichage seul ») — le CHECK `OrderLine_quantity_ck` le couvre déjà.
