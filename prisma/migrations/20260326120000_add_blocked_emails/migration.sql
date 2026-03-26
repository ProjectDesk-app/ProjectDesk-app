CREATE TABLE "BlockedEmail" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedById" INTEGER,

    CONSTRAINT "BlockedEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlockedEmail_email_key" ON "BlockedEmail"("email");
CREATE INDEX "BlockedEmail_createdAt_idx" ON "BlockedEmail"("createdAt");

ALTER TABLE "BlockedEmail"
ADD CONSTRAINT "BlockedEmail_blockedById_fkey"
FOREIGN KEY ("blockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
