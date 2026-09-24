-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "ip" TEXT;

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "last_accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMPTZ(6),
ADD COLUMN     "settings" JSONB,
ADD COLUMN     "spotify_access_token" TEXT,
ADD COLUMN     "spotify_refresh_token" TEXT,
ADD COLUMN     "yt_access_token" TEXT,
ADD COLUMN     "yt_refresh_token" TEXT;

-- CreateTable
CREATE TABLE "cached_tracks" (
    "id" TEXT NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "s3_url" TEXT NOT NULL,
    "requested_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cached_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listen_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "youtube_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "thumbnail" TEXT,
    "played_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "song_id" TEXT,

    CONSTRAINT "listen_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'SYNCBEATS',
    "source_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "album_art" TEXT,
    "duration" INTEGER,
    "release_year" INTEGER,
    "genre" TEXT,
    "spotify_id" TEXT,
    "youtube_id" TEXT,
    "youtube_thumbnail" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_tracks" (
    "id" TEXT NOT NULL,
    "playlist_id" TEXT NOT NULL,
    "song_id" TEXT,
    "youtube_id" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "thumbnail" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_invites" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "invitee_id" TEXT,
    "invitee_email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beat_events_cache" (
    "spotify_id" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beat_events_cache_pkey" PRIMARY KEY ("spotify_id")
);

-- CreateTable
CREATE TABLE "user_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "rating" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "comment" TEXT,
    "app_version" TEXT,
    "page" TEXT,
    "session_id" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_telemetry" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT,
    "device_type" TEXT,
    "os" TEXT,
    "exact_model" TEXT,
    "user_agent" TEXT,
    "network_quality" TEXT NOT NULL,
    "rtt_median_ms" DOUBLE PRECISION NOT NULL,
    "rtt_jitter_ms" DOUBLE PRECISION NOT NULL,
    "rtt_samples" JSONB NOT NULL,
    "clock_offset_ms" DOUBLE PRECISION NOT NULL,
    "drift_samples" JSONB NOT NULL,
    "drift_mean_ms" DOUBLE PRECISION NOT NULL,
    "drift_max_ms" DOUBLE PRECISION NOT NULL,
    "correction_tier" TEXT NOT NULL,
    "corrections_count" INTEGER NOT NULL,
    "playback_rate" DOUBLE PRECISION NOT NULL,
    "audio_unlocked" BOOLEAN NOT NULL,
    "tab_visible" BOOLEAN NOT NULL,
    "session_age_secs" INTEGER NOT NULL,
    "participant_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cached_tracks_youtube_id_key" ON "cached_tracks"("youtube_id");

-- CreateIndex
CREATE INDEX "idx_cached_tracks_youtube_id" ON "cached_tracks"("youtube_id");

-- CreateIndex
CREATE INDEX "search_history_user_id_created_at_idx" ON "search_history"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "listen_history_user_id_played_at_idx" ON "listen_history"("user_id", "played_at" DESC);

-- CreateIndex
CREATE INDEX "playlists_user_id_idx" ON "playlists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "songs_spotify_id_key" ON "songs"("spotify_id");

-- CreateIndex
CREATE INDEX "songs_youtube_id_idx" ON "songs"("youtube_id");

-- CreateIndex
CREATE INDEX "songs_spotify_id_idx" ON "songs"("spotify_id");

-- CreateIndex
CREATE UNIQUE INDEX "songs_title_artist_key" ON "songs"("title", "artist");

-- CreateIndex
CREATE INDEX "playlist_tracks_playlist_id_position_idx" ON "playlist_tracks"("playlist_id", "position");

-- CreateIndex
CREATE INDEX "playlist_tracks_song_id_idx" ON "playlist_tracks"("song_id");

-- CreateIndex
CREATE INDEX "room_invites_invitee_id_idx" ON "room_invites"("invitee_id");

-- CreateIndex
CREATE INDEX "room_invites_invitee_email_idx" ON "room_invites"("invitee_email");

-- CreateIndex
CREATE UNIQUE INDEX "room_invites_room_id_invitee_id_key" ON "room_invites"("room_id", "invitee_id");

-- CreateIndex
CREATE INDEX "user_feedback_user_id_idx" ON "user_feedback"("user_id");

-- CreateIndex
CREATE INDEX "user_feedback_rating_idx" ON "user_feedback"("rating");

-- CreateIndex
CREATE INDEX "user_feedback_created_at_idx" ON "user_feedback"("created_at" DESC);

-- CreateIndex
CREATE INDEX "user_feedback_category_idx" ON "user_feedback"("category");

-- CreateIndex
CREATE INDEX "sync_telemetry_session_id_idx" ON "sync_telemetry"("session_id");

-- CreateIndex
CREATE INDEX "sync_telemetry_room_id_idx" ON "sync_telemetry"("room_id");

-- CreateIndex
CREATE INDEX "sync_telemetry_user_id_idx" ON "sync_telemetry"("user_id");

-- CreateIndex
CREATE INDEX "sync_telemetry_network_quality_idx" ON "sync_telemetry"("network_quality");

-- CreateIndex
CREATE INDEX "sync_telemetry_created_at_idx" ON "sync_telemetry"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listen_history" ADD CONSTRAINT "listen_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listen_history" ADD CONSTRAINT "listen_history_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
