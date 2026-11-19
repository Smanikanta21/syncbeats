// Use the real backend catalog/ranker for review fixtures, never provider feeds.
// Run npm run build in dev/syncbeats-server first.
const fs = require('node:fs');
const { ARTISTS, LANGUAGES, GENRES } = require('../../dev/syncbeats-server/dist/recommendations/catalog');
const { buildFeed, emptyTaste, parseTaste } = require('../../dev/syncbeats-server/dist/recommendations/engine');
const output = process.argv[2] || '/tmp/syncbeats-recommendations-layouts.json';
fs.writeFileSync(output, JSON.stringify({
  catalog: { artists: ARTISTS, languages: LANGUAGES, genres: GENRES },
  starter: buildFeed(emptyTaste(), []),
  personalized: buildFeed(parseTaste({ languages: ['Telugu'], favoriteArtistIds: ['anirudh', 'sid-sriram'], useActivity: true }), []),
}, null, 2));
console.log(output);
