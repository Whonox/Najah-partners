-- CreateEnum
CREATE TYPE "EcardOrigin" AS ENUM ('MEMBER', 'GENESIS');

-- AlterEnum
BEGIN;
CREATE TYPE "BvMovementType_new" AS ENUM ('ECARD_CREATION', 'ECARD_REFUND', 'COMMISSION', 'ACTIVATION', 'ADMIN_ADJUSTMENT', 'ADMIN_GENESIS');
ALTER TABLE "BvLedgerEntry" ALTER COLUMN "type" TYPE "BvMovementType_new" USING ("type"::text::"BvMovementType_new");
ALTER TYPE "BvMovementType" RENAME TO "BvMovementType_old";
ALTER TYPE "BvMovementType_new" RENAME TO "BvMovementType";
DROP TYPE "public"."BvMovementType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Ecard" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "createdByAdminId" INTEGER,
ADD COLUMN     "origin" "EcardOrigin" NOT NULL DEFAULT 'MEMBER',
ALTER COLUMN "creatorId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Ecard_status_expiresAt_idx" ON "Ecard"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "Ecard" ADD CONSTRAINT "Ecard_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariant d'origine (D-025), inexprimable en Prisma : une e-card MEMBER a forcément un
-- créateur (son solde a été débité → remboursable) ; une e-card GENESIS n'en a aucun (née
-- ex nihilo → rien à rembourser) et porte l'admin qui l'a émise. Sans ce CHECK, un bug de
-- code pourrait produire une e-card MEMBER sans créancier, donc du BV détruit ou créé.
ALTER TABLE "Ecard" ADD CONSTRAINT "Ecard_origin_creator_ck" CHECK (
  ("origin" = 'MEMBER'  AND "creatorId" IS NOT NULL AND "createdByAdminId" IS NULL) OR
  ("origin" = 'GENESIS' AND "creatorId" IS NULL     AND "createdByAdminId" IS NOT NULL)
);

