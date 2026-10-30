CREATE TABLE "NotificationPreferences" (
  "userId" INTEGER NOT NULL PRIMARY KEY,
  "taskComments" TEXT NOT NULL DEFAULT 'IMMEDIATE',
  "taskFlags" TEXT NOT NULL DEFAULT 'IMMEDIATE',
  "projectStatus" TEXT NOT NULL DEFAULT 'IMMEDIATE',
  "deadlineSummary" BOOLEAN NOT NULL DEFAULT true,
  "taskAssignments" BOOLEAN NOT NULL DEFAULT true,
  "taskDeadlineChanges" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "NotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ActivityEmail" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "eventKey" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "projectId" INTEGER NOT NULL,
  "taskId" INTEGER,
  "deliveryMode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "claimedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ActivityEmail_userId_eventKey_key" ON "ActivityEmail"("userId", "eventKey");
CREATE INDEX "ActivityEmail_status_userId_idx" ON "ActivityEmail"("status", "userId");
CREATE TABLE "ScheduledJobRun" (
  "key" TEXT PRIMARY KEY,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3)
);
