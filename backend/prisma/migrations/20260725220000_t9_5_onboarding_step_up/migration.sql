-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "stepUpFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stepUpLockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MemberSecurityAnswer" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "questionKey" TEXT NOT NULL,
    "answerHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberSecurityAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberSecurityAnswer_memberId_idx" ON "MemberSecurityAnswer"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSecurityAnswer_memberId_questionKey_key" ON "MemberSecurityAnswer"("memberId", "questionKey");

-- AddForeignKey
ALTER TABLE "MemberSecurityAnswer" ADD CONSTRAINT "MemberSecurityAnswer_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

