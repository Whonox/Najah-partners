-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('REGISTERED', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Leg" AS ENUM ('LEFT', 'RIGHT');

-- CreateEnum
CREATE TYPE "EcardStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('DIRECT', 'INDIRECT', 'STARTUP_BONUS');

-- CreateEnum
CREATE TYPE "BvMovementType" AS ENUM ('ECARD_CREATION', 'ECARD_USE', 'ECARD_REFUND', 'COMMISSION', 'ACTIVATION', 'ADMIN_ADJUSTMENT', 'ADMIN_GENESIS');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PHYSICAL', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('IN_PROGRESS', 'SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "OrderContext" AS ENUM ('ACTIVATION', 'FREE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PREPARATION', 'SHIPPED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'MANAGER', 'SUPPORT');

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "memberCode" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'REGISTERED',
    "packId" INTEGER,
    "sponsorId" INTEGER,
    "uplineId" INTEGER,
    "leg" "Leg",
    "bvBalance" INTEGER NOT NULL DEFAULT 0,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "renewalAt" TIMESTAMP(3),
    "baselineLeft" INTEGER NOT NULL DEFAULT 0,
    "baselineRight" INTEGER NOT NULL DEFAULT 0,
    "leftPoints" INTEGER NOT NULL DEFAULT 0,
    "rightPoints" INTEGER NOT NULL DEFAULT 0,
    "carriedLeftPoints" INTEGER NOT NULL DEFAULT 0,
    "carriedRightPoints" INTEGER NOT NULL DEFAULT 0,
    "startupBonusRemaining" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pack" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "tierBv" INTEGER NOT NULL,
    "refPriceDt" DECIMAL(12,3) NOT NULL,
    "directCommissionBv" INTEGER NOT NULL,
    "indirectCommissionBv" INTEGER NOT NULL,
    "weeklyCapBv" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BvLedgerEntry" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "type" "BvMovementType" NOT NULL,
    "amountBv" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "ecardId" INTEGER,
    "commissionId" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BvLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ecard" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "valueBv" INTEGER NOT NULL,
    "status" "EcardStatus" NOT NULL DEFAULT 'ACTIVE',
    "creatorId" INTEGER NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Ecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "runId" INTEGER NOT NULL,
    "type" "CommissionType" NOT NULL,
    "amountBv" INTEGER NOT NULL,
    "appliedCapBv" INTEGER,
    "cycles" INTEGER NOT NULL DEFAULT 0,
    "snapshotParams" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRun" (
    "id" SERIAL NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "distributedBv" INTEGER NOT NULL DEFAULT 0,
    "status" "RunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "log" TEXT,

    CONSTRAINT "CommissionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" INTEGER NOT NULL,
    "priceDt" DECIMAL(12,3) NOT NULL,
    "valueBv" INTEGER NOT NULL,
    "type" "ProductType" NOT NULL,
    "stock" INTEGER,
    "shippingFeeDt" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "promoPriceDt" DECIMAL(12,3),
    "images" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "visibleOnSite" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "context" "OrderContext" NOT NULL,
    "totalBv" INTEGER NOT NULL,
    "ecardId" INTEGER,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "shippingAddress" TEXT,
    "shipmentStatus" "ShipmentStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitValueBv" INTEGER NOT NULL,
    "unitPriceDt" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'MANAGER',
    "permissions" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_memberCode_key" ON "Member"("memberCode");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Member_phone_key" ON "Member"("phone");

-- CreateIndex
CREATE INDEX "Member_uplineId_idx" ON "Member"("uplineId");

-- CreateIndex
CREATE INDEX "Member_sponsorId_idx" ON "Member"("sponsorId");

-- CreateIndex
CREATE INDEX "Member_leg_idx" ON "Member"("leg");

-- CreateIndex
CREATE INDEX "Member_status_idx" ON "Member"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Member_uplineId_leg_key" ON "Member"("uplineId", "leg");

-- CreateIndex
CREATE UNIQUE INDEX "Pack_name_key" ON "Pack"("name");

-- CreateIndex
CREATE INDEX "BvLedgerEntry_memberId_idx" ON "BvLedgerEntry"("memberId");

-- CreateIndex
CREATE INDEX "BvLedgerEntry_memberId_createdAt_idx" ON "BvLedgerEntry"("memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ecard_code_key" ON "Ecard"("code");

-- CreateIndex
CREATE INDEX "Ecard_creatorId_idx" ON "Ecard"("creatorId");

-- CreateIndex
CREATE INDEX "Ecard_userId_idx" ON "Ecard"("userId");

-- CreateIndex
CREATE INDEX "Ecard_status_idx" ON "Ecard"("status");

-- CreateIndex
CREATE INDEX "Commission_memberId_runId_idx" ON "Commission"("memberId", "runId");

-- CreateIndex
CREATE INDEX "Commission_runId_idx" ON "Commission"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Order_memberId_idx" ON "Order"("memberId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_uplineId_fkey" FOREIGN KEY ("uplineId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BvLedgerEntry" ADD CONSTRAINT "BvLedgerEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BvLedgerEntry" ADD CONSTRAINT "BvLedgerEntry_ecardId_fkey" FOREIGN KEY ("ecardId") REFERENCES "Ecard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BvLedgerEntry" ADD CONSTRAINT "BvLedgerEntry_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ecard" ADD CONSTRAINT "Ecard_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ecard" ADD CONSTRAINT "Ecard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CommissionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_ecardId_fkey" FOREIGN KEY ("ecardId") REFERENCES "Ecard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
