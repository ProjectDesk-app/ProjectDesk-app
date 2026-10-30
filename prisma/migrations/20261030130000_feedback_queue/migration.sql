-- Manual positions are optional; existing reviews retain receipt-date order.
ALTER TABLE "FeedbackReview" ADD COLUMN "queuePosition" INTEGER;
