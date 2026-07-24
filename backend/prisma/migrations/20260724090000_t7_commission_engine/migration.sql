-- Tranche 7 — Moteur de commissions (D-031, D-032, D-033, D-034, D-035).
--
-- Architecture D-035 : les événements de commission sont écrits AU FIL DE L'EAU, dans la
-- transaction de l'activation (pendant la remontée d'arbre existante). Le run hebdomadaire
-- n'applique plus que le plafond, en chronologie (occurredAt puis id), puis crédite.
--
-- D-031 ANNULE D-012 : l'ancienne réserve de 6 paliers déséquilibrés disparaît
-- (`startupBonusRemaining`, paramètre `startup_bonus_default`). Le bonus devient : UNE
-- commission indirecte quand le sous-arbre atteint 2 membres activés, une seule fois à vie.

-- ─────────────────────────── 1. Enum d'événements ───────────────────────────
-- Remplace `CommissionType` (INDIRECT devient BALANCE — un événement PAR équilibre — et
-- REWARD_POINT apparaît : chaque 6e équilibre à vie donne un Point Fidélité, D-032).
CREATE TYPE "CommissionEventType" AS ENUM ('DIRECT', 'BALANCE', 'STARTUP_BONUS', 'REWARD_POINT');

-- ─────────────────────────── 2. Member ───────────────────────────
ALTER TABLE "Member" DROP COLUMN "startupBonusRemaining";

ALTER TABLE "Member"
    ADD COLUMN "startupBonusUsed" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "lifetimeBalanceCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "activatedDescendants" INTEGER NOT NULL DEFAULT 0;

-- Backfill `activatedDescendants` : nombre de membres ACTIVÉS (activatedAt non nul) dans le
-- sous-arbre strict (le membre lui-même exclu). Fermeture transitive assumée : la base ne
-- contient à ce stade que le réseau d'amorçage et des fixtures de dev — quelques dizaines de
-- lignes. Le garde-fou de profondeur (1000) suit la convention des CTE du projet.
WITH RECURSIVE down AS (
    SELECT m."id" AS root_id, m."id", 0 AS depth
    FROM "Member" m
  UNION ALL
    SELECT d.root_id, c."id", d.depth + 1
    FROM down d
    JOIN "Member" c ON c."uplineId" = d."id"
    WHERE d.depth < 1000
)
UPDATE "Member" m
SET "activatedDescendants" = sub.cnt
FROM (
    SELECT d.root_id,
           COUNT(*) FILTER (WHERE mm."activatedAt" IS NOT NULL AND mm."id" <> d.root_id)::int AS cnt
    FROM down d
    JOIN "Member" mm ON mm."id" = d."id"
    GROUP BY d.root_id
) sub
WHERE m."id" = sub.root_id;

-- Backfill de la POOL APPARIABLE (carry-over courant, D-035) : pour les membres déjà ACTIFS,
-- tout point arrivé après la baseline est encore non consommé (aucun run n'a jamais tourné).
-- Aucun membre INACTIF n'existe avant cette tranche (le gel naît ici, D-034).
UPDATE "Member"
SET "carriedLeftPoints"  = "leftPoints"  - "baselineLeft",
    "carriedRightPoints" = "rightPoints" - "baselineRight"
WHERE "status" = 'ACTIVE';

-- ─────────────────────────── 3. CommissionEvent ───────────────────────────
CREATE TABLE "CommissionEvent" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" "CommissionEventType" NOT NULL,
    "amountDt" DECIMAL(12,3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceMemberId" INTEGER NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "runId" INTEGER,
    "snapshot" JSONB NOT NULL,
    "balanceIndex" INTEGER,

    CONSTRAINT "CommissionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommissionEvent_memberId_occurredAt_idx" ON "CommissionEvent"("memberId", "occurredAt");
CREATE INDEX "CommissionEvent_runId_idx" ON "CommissionEvent"("runId");
CREATE INDEX "CommissionEvent_occurredAt_idx" ON "CommissionEvent"("occurredAt");

ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_sourceMemberId_fkey" FOREIGN KEY ("sourceMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CommissionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariants en base (mêmes raisons que `Ecard_origin_creator_ck` : ces lignes portent de
-- la valeur, un bug applicatif ne doit pas pouvoir écrire l'impossible) :
--   un REWARD_POINT ne porte JAMAIS de dinars (D-032 : il attribue un Point Fidélité) ;
--   `balanceIndex` (n° d'équilibre à vie) existe si et seulement si l'événement est un
--   équilibre (BALANCE / STARTUP_BONUS / REWARD_POINT) — jamais sur un DIRECT ;
--   une commission n'est jamais négative.
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_reward_zero_ck" CHECK (
    "type" <> 'REWARD_POINT' OR "amountDt" = 0
);
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_balance_index_ck" CHECK (
    ("type" = 'DIRECT') = ("balanceIndex" IS NULL)
);
ALTER TABLE "CommissionEvent" ADD CONSTRAINT "CommissionEvent_amount_ck" CHECK (
    "amountDt" >= 0
);

-- ─────────────────────────── 4. Commission → règlement par membre/run ───────────────────────────
-- La table devient l'AGRÉGAT plafonné d'un membre sur un run (le détail vit dans
-- CommissionEvent). Elle est VIDE avant cette tranche (aucun run n'a jamais tourné) :
-- les ADD COLUMN NOT NULL sans défaut sont donc sûrs.
DROP INDEX "Commission_memberId_runId_idx";

ALTER TABLE "Commission"
    DROP COLUMN "type",
    DROP COLUMN "amountDt",
    DROP COLUMN "appliedCapDt",
    DROP COLUMN "cycles",
    ADD COLUMN "grossDt" DECIMAL(12,3) NOT NULL,
    ADD COLUMN "paidDt" DECIMAL(12,3) NOT NULL,
    ADD COLUMN "appliedCapDt" DECIMAL(12,3) NOT NULL,
    ADD COLUMN "eventCount" INTEGER NOT NULL,
    ADD COLUMN "rewardPointsGranted" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rewardPointsLost" INTEGER NOT NULL DEFAULT 0;

-- Un règlement par membre et par run : relancer un run ne peut pas écrire deux fois.
CREATE UNIQUE INDEX "Commission_memberId_runId_key" ON "Commission"("memberId", "runId");

DROP TYPE "CommissionType";

-- ─────────────────────────── 5. CommissionRun ───────────────────────────
ALTER TABLE "CommissionRun" ADD COLUMN "rewardPointsGranted" INTEGER NOT NULL DEFAULT 0;

-- ─────────────────────────── 6. Reliquat D-012 ───────────────────────────
-- L'ancienne réserve paramétrable n'existe plus ; laisser le paramètre rouvrirait la porte
-- à une relecture accidentelle.
DELETE FROM "Setting" WHERE "key" = 'startup_bonus_default';
