# Apple Music metadata repair

Apple Music imports share metadata, not audio or device-local artwork files. The native import payload now retains the original title, artist and album, shares only valid HTTP/HTTPS covers, and tries valid thumbnail fallbacks before omitting unavailable artwork. Missing covers use the existing artwork resolution path.

Library selections send the original title, artist, cover and library provenance to `enqueue-youtube`. The matching backend updates metadata for existing audio without changing queue identity, order, playback epoch or playback instance. Ordinary YouTube enqueues cannot replace library metadata. No database migration is required; provenance lives in the persisted queue JSON.

## Verified on 2026-11-21

- Signed macOS Debug build and generic iOS Debug build succeeded. The iOS build has signing disabled and targets the shared iPhone/iPad app.
- Native library harness: 95 checks, including local song/playlist artwork omission, valid remote fallback and canonical metadata retention.
- Native home harness against a local Postman simulation: 22 API checks, including metadata repair for existing queued audio; 19 existing artwork checks also passed.
- Real Express/auth/local PostgreSQL harness: nine room metadata HTTP checks. Existing Apple Music import persistence, ownership and deletion regression checks passed.
- Room queue/playback/persistence regressions and backend build passed. Frontend TypeScript and production build passed; targeted lint retains 54 baseline findings and introduces none when diagnostic source excerpts are excluded from comparison.

The fixture database was isolated on localhost. These checks do not prove a live MusicKit import, production artwork availability, device installation or playback while locked. Retry the chosen import in the corrected app; physical iPhone/iPad verification remains pending.
