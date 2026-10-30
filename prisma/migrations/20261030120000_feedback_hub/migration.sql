-- AlterTable
ALTER TABLE "User" ADD COLUMN     "feedbackOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FeedbackWork" (
    "id" SERIAL NOT NULL,
    "supervisorId" INTEGER NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FeedbackWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackReview" (
    "id" SERIAL NOT NULL,
    "workId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "receivedDate" TEXT NOT NULL,
    "estimateStart" TEXT NOT NULL,
    "estimateEnd" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "turnaroundWorkingDays" INTEGER,
    "cancellationReason" TEXT,
    "trackingToken" TEXT NOT NULL,
    "lastRequestDate" TEXT,
    "receiptEmailClaimedAt" TIMESTAMP(3),
    "completionEmailClaimedAt" TIMESTAMP(3),
    "receiptEmailSentAt" TIMESTAMP(3),
    "completionEmailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEvent" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackSettings" (
    "userId" INTEGER NOT NULL,
    "dailySummaryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSummaryDate" TEXT,

    CONSTRAINT "FeedbackSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "FeedbackPreset" (
    "id" SERIAL NOT NULL,
    "supervisorId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "minDays" INTEGER,
    "maxDays" INTEGER,

    CONSTRAINT "FeedbackPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackWork_supervisorId_idx" ON "FeedbackWork"("supervisorId");

-- CreateIndex
CREATE INDEX "FeedbackWork_recipientEmail_idx" ON "FeedbackWork"("recipientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackReview_trackingToken_key" ON "FeedbackReview"("trackingToken");

-- CreateIndex
CREATE INDEX "FeedbackReview_status_estimateEnd_idx" ON "FeedbackReview"("status", "estimateEnd");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackReview_workId_version_key" ON "FeedbackReview"("workId", "version");

-- CreateIndex
CREATE INDEX "FeedbackEvent_reviewId_idx" ON "FeedbackEvent"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackPreset_supervisorId_name_key" ON "FeedbackPreset"("supervisorId", "name");

-- AddForeignKey
ALTER TABLE "FeedbackWork" ADD CONSTRAINT "FeedbackWork_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReview" ADD CONSTRAINT "FeedbackReview_workId_fkey" FOREIGN KEY ("workId") REFERENCES "FeedbackWork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "FeedbackReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackSettings" ADD CONSTRAINT "FeedbackSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackPreset" ADD CONSTRAINT "FeedbackPreset_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

