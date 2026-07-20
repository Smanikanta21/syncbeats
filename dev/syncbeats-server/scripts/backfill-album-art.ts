/**
 * Backfill album art for existing songs using Spotify oEmbed.
 *
 * This script finds songs that either:
 *   1. Have a spotifyId but their albumArt points to a playlist cover (shared across many songs)
 *   2. Have a spotifyId but no albumArt at all
 *
 * For each, it fetches the actual album cover via Spotify's free oEmbed endpoint
 * and updates the Song record.
 *
 * Usage:   npx ts-node scripts/backfill-album-art.ts
 *  — or —  node -r ts-node/register scripts/backfill-album-art.ts
 */

import prisma from '../src/db/prisma';

// @ts-ignore
const fetch = require('isomorphic-unfetch');

const BATCH_SIZE = 5;
const DELAY_MS = 200; // Small delay between batches to be polite to Spotify

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAlbumArt(spotifyId: string): Promise<string | null> {
  try {
    const url = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${spotifyId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.thumbnail_url || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('[Backfill] Starting album art backfill...\n');

  // Find songs that have a spotifyId — we can fetch their proper album art
  const songs = await prisma.song.findMany({
    where: {
      spotifyId: { not: null },
    },
    select: {
      id: true,
      title: true,
      artist: true,
      spotifyId: true,
      albumArt: true,
    },
  });

  console.log(`[Backfill] Found ${songs.length} songs with Spotify IDs.\n`);

  // Identify which ones need updating:
  // - Songs sharing the same albumArt URL are likely using the playlist cover
  // - Songs with no albumArt at all
  const artCounts = new Map<string, number>();
  for (const s of songs) {
    if (s.albumArt) {
      artCounts.set(s.albumArt, (artCounts.get(s.albumArt) || 0) + 1);
    }
  }

  // Any URL used by 3+ songs is almost certainly a playlist-level cover, not per-track
  const playlistCovers = new Set<string>();
  for (const [url, count] of artCounts) {
    if (count >= 3) {
      playlistCovers.add(url);
      console.log(`[Backfill] Detected shared playlist cover (${count} songs): ${url.slice(0, 80)}...`);
    }
  }

  const needsUpdate = songs.filter(s =>
    !s.albumArt || playlistCovers.has(s.albumArt)
  );

  console.log(`\n[Backfill] ${needsUpdate.length} songs need album art update.\n`);

  if (needsUpdate.length === 0) {
    console.log('[Backfill] All songs already have individual album art. Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < needsUpdate.length; i += BATCH_SIZE) {
    const batch = needsUpdate.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (song) => {
        const art = await fetchAlbumArt(song.spotifyId!);
        if (art) {
          await prisma.song.update({
            where: { id: song.id },
            data: { albumArt: art },
          });
          updated++;
          console.log(`  ✓ ${song.title} — ${song.artist}`);
        } else {
          failed++;
          console.log(`  ✗ ${song.title} — ${song.artist} (no oEmbed result)`);
        }
      })
    );

    // Be polite
    if (i + BATCH_SIZE < needsUpdate.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n[Backfill] Done! Updated: ${updated}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[Backfill] Fatal error:', e);
  prisma.$disconnect();
  process.exit(1);
});
