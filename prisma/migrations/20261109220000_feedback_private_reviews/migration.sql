-- A missing recipient email marks a supervisor-only review with no student link.
ALTER TABLE "FeedbackWork" ALTER COLUMN "recipientEmail" DROP NOT NULL;
