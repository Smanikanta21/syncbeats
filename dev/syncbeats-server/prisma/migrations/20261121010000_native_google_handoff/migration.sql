-- CreateTable
CREATE TABLE "native_auth_codes" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "native_auth_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "native_auth_codes_code_hash_key" ON "native_auth_codes"("code_hash");

-- CreateIndex
CREATE INDEX "native_auth_codes_expires_at_idx" ON "native_auth_codes"("expires_at");

-- AddForeignKey
ALTER TABLE "native_auth_codes" ADD CONSTRAINT "native_auth_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
