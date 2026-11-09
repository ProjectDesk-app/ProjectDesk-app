CREATE TABLE "FeedbackPageView" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "viewId" VARCHAR(36) NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recipientName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackPageView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedbackPageView_reviewId_viewId_key" ON "FeedbackPageView"("reviewId", "viewId");
CREATE INDEX "FeedbackPageView_reviewId_createdAt_idx" ON "FeedbackPageView"("reviewId", "createdAt");
ALTER TABLE "FeedbackPageView" ADD CONSTRAINT "FeedbackPageView_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "FeedbackReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
