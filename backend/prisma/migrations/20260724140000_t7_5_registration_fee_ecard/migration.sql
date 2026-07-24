-- Tranche 7.5 — Frais d'inscription par e-card & acompte (D-036, D-037, D-038, D-039).
--
-- Ce que cette migration acte : plus AUCUN montant d'adhésion ne se règle « en espèces hors
-- système ». L'inscription (100 DT) est payée par e-card(s) et devient un ACOMPTE déduit du
-- prix du pack à l'activation ; le renouvellement annuel (100 DT) est payé par e-card(s) puis
-- validé par l'admin. Une commande peut désormais être réglée par PLUSIEURS e-cards (D-030).

-- ─────────────────────────── Paiement d'adhésion ───────────────────────────

CREATE TYPE "MembershipPaymentType" AS ENUM ('REGISTRATION', 'RENEWAL');
CREATE TYPE "MembershipPaymentStatus" AS ENUM ('SETTLED', 'PENDING_VALIDATION', 'VALIDATED');

CREATE TABLE "MembershipPayment" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" "MembershipPaymentType" NOT NULL,
    "status" "MembershipPaymentStatus" NOT NULL,
    "amountDt" DECIMAL(12,3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(3),
    "validatedByAdminId" INTEGER,

    CONSTRAINT "MembershipPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MembershipPayment_memberId_idx" ON "MembershipPayment"("memberId");
CREATE INDEX "MembershipPayment_status_type_idx" ON "MembershipPayment"("status", "type");

ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_validatedByAdminId_fkey"
  FOREIGN KEY ("validatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────── Membre : acompte + numéro de pièce ───────────────────────────

-- D-039 : le numéro de la pièce, saisi à la main, à comparer à l'image par l'admin.
-- Nullable et JAMAIS bloquant (D-018) — un membre PENDING s'inscrit et s'active normalement.
ALTER TABLE "Member" ADD COLUMN "idDocumentNumber" TEXT;

-- D-036/D-037 : les frais d'inscription réellement versés, FIGÉS. C'est l'acompte déduit du
-- prix du pack à l'activation. Les membres déjà en base gardent 0 : c'est la vérité
-- historique (ils n'ont rien versé dans le système) et ils paieront donc le prix plein.
ALTER TABLE "Member" ADD COLUMN "registrationPaidDt" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- Un acompte négatif majorerait le prix du pack au lieu de le réduire.
ALTER TABLE "Member" ADD CONSTRAINT "Member_registration_paid_dt_ck" CHECK ("registrationPaidDt" >= 0);

-- ─────────────────────────── E-cards cumulables (D-030) ───────────────────────────
-- Le lien e-card ↔ commande CHANGE DE CÔTÉ. Jusqu'ici : `Order.ecardId UNIQUE` (1 commande =
-- 1 carte). Désormais 1 commande = 1..n cartes, 1 carte = 0..1 commande : la FK va donc du
-- côté « plusieurs ». L'unicité que garantissait l'index devient structurelle — une colonne
-- ne peut pas contenir deux valeurs.

ALTER TABLE "Ecard" ADD COLUMN "orderId" INTEGER;
ALTER TABLE "Ecard" ADD COLUMN "membershipPaymentId" INTEGER;

-- Reprise des commandes existantes : chacune avait exactement une carte.
UPDATE "Ecard" e SET "orderId" = o."id" FROM "Order" o WHERE o."ecardId" = e."id";

CREATE INDEX "Ecard_orderId_idx" ON "Ecard"("orderId");
CREATE INDEX "Ecard_membershipPaymentId_idx" ON "Ecard"("membershipPaymentId");

ALTER TABLE "Ecard" ADD CONSTRAINT "Ecard_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ecard" ADD CONSTRAINT "Ecard_membershipPaymentId_fkey"
  FOREIGN KEY ("membershipPaymentId") REFERENCES "MembershipPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une carte paie UNE chose : une commande, ou une adhésion, jamais les deux (usage unique,
-- D-007). Cet invariant était inexprimable tant que le lien vivait sur `Order` ; il l'est
-- maintenant, et la base le tient.
ALTER TABLE "Ecard" ADD CONSTRAINT "Ecard_single_target_ck" CHECK (
  NOT ("orderId" IS NOT NULL AND "membershipPaymentId" IS NOT NULL)
);

-- ─────────────────────────── Commande : compteur de cartes ───────────────────────────
-- `Order_paid_ecard_ck` (D-027 : aucun achat n'échappe au paiement) portait sur `ecardId`.
-- Un CHECK ne peut pas interroger une autre table : on le réancre sur un compteur figé à la
-- création, écrit dans la même instruction que la commande et jamais mis à jour ensuite.

ALTER TABLE "Order" DROP CONSTRAINT "Order_paid_ecard_ck";
ALTER TABLE "Order" ADD COLUMN "ecardCount" INTEGER NOT NULL DEFAULT 0;
UPDATE "Order" SET "ecardCount" = 1 WHERE "ecardId" IS NOT NULL;

ALTER TABLE "Order" DROP CONSTRAINT "Order_ecardId_fkey";
DROP INDEX "Order_ecardId_key";
ALTER TABLE "Order" DROP COLUMN "ecardId";

ALTER TABLE "Order" ADD CONSTRAINT "Order_paid_ecard_ck" CHECK (
  "status" <> 'PAID' OR "ecardCount" > 0
);

-- ─────────────────────────── Invariants du paiement d'adhésion ───────────────────────────
-- Mêmes raisons que `Ecard_origin_creator_ck` (T5) ou `Order_paid_ecard_ck` (T6) : ces règles
-- portent de la VALEUR. Les services les tiennent déjà ; la base les rend indémontables par
-- un script, un import ou un module futur qui écrirait sans passer par eux.

-- « Sans e-card valide, pas d'inscription » (D-036) : une adhésion à 0 DT n'existe pas.
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_amount_positive_ck" CHECK ("amountDt" > 0);

-- L'inscription est acquise d'emblée (D-010) ; le renouvellement ne l'est JAMAIS sans passer
-- par l'attente de validation (D-038 : payer ne dégèle pas).
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_type_status_ck" CHECK (
  ("type" = 'REGISTRATION' AND "status" = 'SETTLED')
  OR ("type" = 'RENEWAL' AND "status" IN ('PENDING_VALIDATION', 'VALIDATED'))
);

-- Pas de validation fantôme : VALIDATED dit forcément QUI a validé et QUAND, et réciproquement.
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_validated_ck" CHECK (
  ("status" = 'VALIDATED') = ("validatedAt" IS NOT NULL AND "validatedByAdminId" IS NOT NULL)
);
