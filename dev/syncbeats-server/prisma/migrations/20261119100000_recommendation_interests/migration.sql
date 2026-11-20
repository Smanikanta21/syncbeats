-- Keep the two tables and their constraints atomic if deployment is interrupted.
BEGIN;

-- CreateTable
CREATE TABLE "music_taste_profiles" (
    "user_id" TEXT NOT NULL,
    "onboarding_status" TEXT NOT NULL DEFAULT 'NEW',
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "favorite_artist_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "custom_artists" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "use_activity" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "music_taste_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "recommendation_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT 'PERSONAL',
    "seconds_listened" INTEGER NOT NULL DEFAULT 0,
    "model_version" TEXT NOT NULL DEFAULT 'rules-v1',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_events_user_id_created_at_idx" ON "recommendation_events"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_events_user_id_event_id_key" ON "recommendation_events"("user_id", "event_id");

-- AddForeignKey
ALTER TABLE "music_taste_profiles" ADD CONSTRAINT "music_taste_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
