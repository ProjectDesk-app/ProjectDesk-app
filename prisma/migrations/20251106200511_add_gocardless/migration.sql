-- AlterTable
ALTER TABLE "User" ADD COLUMN     "goCardlessCustomerId" TEXT,
ADD COLUMN     "goCardlessMandateId" TEXT,
ADD COLUMN     "goCardlessSubscriptionId" TEXT,
ADD COLUMN     "goCardlessSubscriptionStatus" TEXT;

-- CreateTable
CREATE TABLE "GoCardlessRedirectFlow" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "flowId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GoCardlessRedirectFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoCardlessRedirectFlow_flowId_key" ON "GoCardlessRedirectFlow"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "GoCardlessRedirectFlow_sessionToken_key" ON "GoCardlessRedirectFlow"("sessionToken");

-- CreateIndex
CREATE INDEX "GoCardlessRedirectFlow_userId_idx" ON "GoCardlessRedirectFlow"("userId");

-- AddForeignKey
ALTER TABLE "GoCardlessRedirectFlow" ADD CONSTRAINT "GoCardlessRedirectFlow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
