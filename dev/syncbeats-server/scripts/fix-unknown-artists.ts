import prisma from '../src/db/prisma';
// @ts-ignore
const fetch = require('isomorphic-unfetch');

async function main() {
  console.log('[Fix] Querying database for songs with Unknown Artist...');
  
  const btSongs = await prisma.song.findMany({ where: { title: { contains: 'Beautiful Things', mode: 'insensitive' } } });
  console.log('[Fix] Song table matches for Beautiful Things:', btSongs);

  const btTracks = await prisma.playlistTrack.findMany({ where: { title: { contains: 'Beautiful Things', mode: 'insensitive' } } });
  console.log('[Fix] PlaylistTrack table matches for Beautiful Things:', btTracks);

  const btQueue = await prisma.roomQueueItem.findMany({ where: { title: { contains: 'Beautiful Things', mode: 'insensitive' } } });
  console.log('[Fix] RoomQueueItem table matches for Beautiful Things:', btQueue);

  const songs = await prisma.song.findMany({
    where: {
      OR: [
        { artist: { equals: 'Unknown', mode: 'insensitive' } },
        { artist: { equals: 'Unknown Artist', mode: 'insensitive' } },
        { artist: { equals: '', mode: 'insensitive' } },
        { artist: { startsWith: 'Unknown', mode: 'insensitive' } }
      ]
    }
  });

  console.log(`[Fix] Found ${songs.length} songs with Unknown Artist.`);

  let fixed = 0;

  for (const s of songs) {
    try {
      console.log(`[Fix] Querying iTunes for song: "${s.title}"`);
      const q = encodeURIComponent(s.title);
      const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
      if (!res.ok) continue;
      
      const data: any = await res.json();
      const result = data.results?.[0];
      if (!result) continue;

      const resolvedArtist = result.artistName;
      const album = result.collectionName || null;
      const artworkUrl = result.artworkUrl100
        ? result.artworkUrl100.replace('100x100', '600x600')
        : null;

      if (resolvedArtist) {
        console.log(`[Fix] Song Success: "${s.title}" -> "${resolvedArtist}"`);
        await prisma.song.update({
          where: { id: s.id },
          data: {
            artist: resolvedArtist,
            ...(album ? { album } : {}),
            ...(artworkUrl ? { albumArt: artworkUrl } : {})
          }
        });

        await prisma.playlistTrack.updateMany({
          where: { songId: s.id },
          data: {
            artist: resolvedArtist,
            ...(artworkUrl ? { thumbnail: artworkUrl } : {})
          }
        });

        fixed++;
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`[Fix] Failed for song ${s.title}:`, e);
    }
  }

  // 4. Query and resolve RoomQueueItems where artist is null or Unknown
  const queueItems = await prisma.roomQueueItem.findMany({
    where: {
      OR: [
        { artist: null },
        { artist: 'Unknown' },
        { artist: 'Unknown Artist' },
        { artist: '' }
      ]
    }
  });

  console.log(`[Fix] Found ${queueItems.length} RoomQueueItems with null/Unknown artist.`);

  for (const item of queueItems) {
    try {
      console.log(`[Fix] Querying iTunes for RoomQueueItem: "${item.title}"`);
      const q = encodeURIComponent(item.title);
      const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
      if (!res.ok) continue;
      const data: any = await res.json();
      const result = data.results?.[0];
      if (!result) continue;

      const resolvedArtist = result.artistName;
      if (resolvedArtist) {
        console.log(`[Fix] RoomQueueItem Success: "${item.title}" -> "${resolvedArtist}"`);
        await prisma.roomQueueItem.update({
          where: { id: item.id },
          data: { artist: resolvedArtist }
        });
        fixed++;
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`[Fix] Failed for queue item ${item.title}:`, e);
    }
  }

  console.log(`\n[Fix] Done! Auto-healed ${fixed} records.`);
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
