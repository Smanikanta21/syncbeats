-- Room queue, persisted as one JSON document per room.
-- Purely additive: nullable column, no backfill, no data loss. A room with a NULL
-- queue simply starts empty and is written on the first queue mutation.
ALTER TABLE "rooms" ADD COLUMN "queue" JSONB;
