CREATE TABLE "EmailTemplateOverride" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "isCustomized" BOOLEAN NOT NULL DEFAULT true,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "buttonLabel" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
