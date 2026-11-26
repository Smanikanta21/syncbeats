-- AlterTable
ALTER TABLE "playlist_tracks" ADD COLUMN     "source_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "playlist_tracks_playlist_id_source_id_key" ON "playlist_tracks"("playlist_id", "source_id");
