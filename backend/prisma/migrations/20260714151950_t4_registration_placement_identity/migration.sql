-- CreateEnum
CREATE TYPE "IdDocumentType" AS ENUM ('ID_CARD', 'DRIVING_LICENSE', 'PASSPORT');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_sponsorId_fkey";

-- DropForeignKey
ALTER TABLE "Member" DROP CONSTRAINT "Member_uplineId_fkey";

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "activationSnapshot" JSONB,
ADD COLUMN     "activationTierBv" INTEGER,
ADD COLUMN     "idDocumentPath" TEXT,
ADD COLUMN     "idDocumentType" "IdDocumentType",
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Member_verificationStatus_idx" ON "Member"("verificationStatus");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_uplineId_fkey" FOREIGN KEY ("uplineId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateSequence (ajout manuel — Prisma ne modélise pas les séquences autonomes)
-- Source des codes membres : 'NP' || lpad(nextval, 6, '0'). nextval() est hors transaction
-- (deux inscriptions simultanées obtiennent deux codes distincts sans jamais s'attendre) ;
-- un rollback laisse un trou dans la numérotation, ce qui est sans conséquence : seule
-- l'unicité du code est un invariant. START WITH 1 : la migration reste neutre, c'est le
-- SEED qui cale le compteur sur D-019 (premier code réel après NP000969).
CREATE SEQUENCE "member_code_seq" AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;
