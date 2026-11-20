-- CreateTable
CREATE TABLE "mac_beta_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "mac_chip" TEXT NOT NULL,
    "macos_version" TEXT,
    "testing_interest" TEXT,
    "consent_version" TEXT NOT NULL,
    "consented_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mac_beta_signups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mac_beta_signups_email_key" ON "mac_beta_signups"("email");

-- CreateIndex
CREATE INDEX "mac_beta_signups_expires_at_idx" ON "mac_beta_signups"("expires_at");
