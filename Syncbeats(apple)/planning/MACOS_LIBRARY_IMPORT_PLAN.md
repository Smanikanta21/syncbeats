# Library and Apple Music import

## Native implementation — 2026-11-20

The approved Library direction is now implemented in SwiftUI on `macos-dev`. Open **Library** in the app header; Songs, Playlists, Albums and Artists are available through the navigation rail in wide windows and horizontal tabs in compact windows. Home remains reachable from the same navigation. Playlist management uses the existing player and room commands; this work does not edit the player implementation.

The Library loads the signed-in user's saved backend playlists through authenticated `GET /api/playlists` and `GET /api/playlists/:id`. Songs load the shared account catalog, including imported Apple Music metadata and any remaining legacy local collections. Albums and artists group actual saved metadata; tracks without album metadata stay in Songs rather than appearing in invented albums. Home discovery cards now offer **Save to Library**.

Apple Music import requests access only when the user chooses to read their library, paginates songs and playlists, preserves playlist order, and lets the user select what to copy. Imports save metadata to the signed-in SyncBeats account through authenticated, bounded API batches. Songs and playlists are stored in PostgreSQL and become available to the website and other account devices. Older local-only collections remain readable until the user re-imports them successfully. They do not download Apple Music audio or change the room queue. A song without a playable room version offers a proposed YouTube match for review before acceptance; queueing continues to use the existing authoritative room commands.

Validation: signed macOS Debug build and backend type checking passed, along with 54 native Library checks, 40 account/artwork checks and 20 real HTTP/database playlist checks. Database tests use the isolated local `syncbeats_playlist_test` database. The running app showed 519 imported songs and an imported playlist; accessibility inspection confirmed the rename sheet, searchable song selection with existing entries disabled, and both delete choices. These dialogs were canceled without changing the user's collection. First-time MusicKit authorization and pixel-level visual review were not exercised during this check.

## Playlist management

Open a playlist to find **Rename**, **Add songs** and **Delete**. Individual song rows also open a playlist destination chooser. The picker searches saved Library songs, allows up to 200 selections per operation, preserves order and skips duplicates. Imported playlist renames and manually added songs persist on this Mac and survive re-import; Apple Music originals are not edited.

Deletion defaults to **Delete playlist only**, which retains the songs in Library. **Delete playlist and its songs** removes the playlist and its standalone Library entries, while keeping songs referenced by other playlists. Backend deletion never deletes global Song records or audio, and does not change other accounts' collections. The built-in Liked Songs collection remains available for saving songs and is not offered as a deletable/renamable playlist.

Remote song selection uses authenticated `POST /api/playlists/:id/tracks/batch`; deletion sends an explicit `songDisposition` of `keep` or `remove`. Both writes are transactional. Native deletion first checks `GET /api/playlists/:id/management` so an older backend cannot silently apply incompatible deletion behavior. Existing clients that omit the disposition retain their prior contract. Cloud playlist management requires deploying these backend changes; no deployment was performed in this task.

## Approved HTML review

The interactive standalone HTML demo established the approved direction before the SwiftUI implementation. It uses sample collections and simulates Apple Music permission, selection and import; it cannot access MusicKit from HTML. The native implementation preserves the current dark studio/light gallery palette, gold accent, account monogram and bottom player.

Proposed direction: warm, orderly, music-first. Quiet navigation surrounds album artwork and playlist covers. A small “In the room” marker identifies songs already in the shared queue. Songs, Playlists and Artists are distinct views of the same saved collection. “All songs” means the user's saved/imported songs, not all songs available on YouTube or Apple Music. Search outside the collection remains available in Home.

## Demo behavior

- Songs: sortable list, query and source filters, play/queue actions, clear empty results.
- Playlists: cover grid, detail view with ordered tracks, create a playlist, queue a playlist.
- Artists: artists represented in the collection, opening an artist shows their saved songs and albums.
- Apple Music: explain what is copied, simulate permission, choose songs or playlists, preview selection counts, import and review skipped/unmatched items. Repeating an import must not create duplicate songs or playlists.
- Import copies collection metadata and playlist order. No Apple Music audio files are downloaded. Imported songs may need a matched room version before they can be shared.
- Player: fixed to the app frame, opens an expanded player; queue and devices remain reachable where space permits. Compact windows replace sidebars with view navigation and short device names.
- Accessibility: keyboard navigation, visible focus, dialogs restore focus, Escape dismisses overlays, reduced motion.

## Repository contracts

The native sources now contain `Features/Library/AppleMusicLibraryImport.swift`, which uses MusicKit library requests and authorization. The project already provides the Apple Music usage description. No new entitlement or signing capability was added in this change; actual authorized library reading remains a runtime verification item.

The backend Playlist model has sourceType and externalId. PlaylistRoutes provides authenticated listing, detail, editing and liked-song saving via `POST /api/playlists/library/tracks`. MusicBridgeRoutes exposes authenticated `POST /api/bridge/resolve` for title/artist resolution. RoomHomeAPI enqueues resolved YouTube results through `POST /rooms/:roomID/enqueue-youtube`. Apple Music metadata is persisted locally; no batch-import endpoint was added. Playback changes remain driven by authoritative snapshots.

## Design requirements

1. Add an account-scoped library store and Codable models for songs, ordered playlists, source identities and match state. Artists are derived from saved songs; do not label a global artist catalog as available offline.
2. Add a MusicKit adapter using MusicAuthorization.request() and paginated MusicLibraryRequest<Song>/MusicLibraryRequest<Playlist>. Load playlist relationships and all subsequent batches. Preserve external IDs, playlist order, artwork URLs, title, artist, album and duration. Handle denied/restricted permission, empty libraries and interrupted reads.
3. Preview selected items before import. Upsert by source identity, preserving distinct recordings and playlist track order. Record partial failures and retry only failed items. Separate refreshing imported metadata from deleting user-created items.
4. Use the existing authenticated playlist list/detail and liked-song endpoints for saved collections. Cross-device Apple Music imports would require a separate batch-import contract, per-user source/external-ID uniqueness and transactional playlist writes. Queue history alone must not be treated as a saved library.
5. Resolve a room version lazily when playback/queueing is requested. The current bridge accepts title and artist; duration and catalog identity remain local metadata. A MusicKit ID is not a backend PlaylistTrack ID. Show unresolved matches and let the user choose a version. Direct Apple Music subscription playback is a separate path with separate sync constraints.
6. Reuse existing queue commands and snapshots, native audio download/scheduling, clock sync, reconnect readiness and hybrid transport behavior. Import must not start playback or change playback rate.

## Demo verification

The standalone [Library demo](macos-library.html) passed 58 browser checks for collection navigation, search and empty states, source filtering, ordered playlists, playlist creation, duplicate-safe imports, permission denial, focus restoration, player controls and responsive layouts from 1440 × 900 to 360 × 360.

Imported songs that need a match stay out of playback and the room queue until a sample version is selected. Collection actions skip unresolved songs with a message, and re-import preserves the selected version. Playback and Apple Music access are simulated; no native MusicKit or backend library implementation is included in this review stage.

Ten additional inline-artifact checks passed for file size, scoped themes, embedded artwork decoding and import-dialog bounds at 900 × 820, 580 × 600 and 360 × 360. Three screenshots were generated, but the image feed returned unreadable thumbnails. DOM layout checks passed; visual inspection remains pending. The inline chat copy uses compressed embedded artwork and a fixed demo frame while the standalone version fits its browser window.

## References

- [MusicLibraryRequest](https://developer.apple.com/documentation/musickit/musiclibraryrequest)
- [MusicAuthorization.request](https://developer.apple.com/documentation/musickit/musicauthorization/request())
- [Playlist](https://developer.apple.com/documentation/musickit/playlist)
- [MusicItemCollection.hasNextBatch](https://developer.apple.com/documentation/musickit/musicitemcollection/hasnextbatch)

Design process: unslop by Damir Sokolovsky (@heydamir), CC BY 4.0. Preserve attribution in the standalone demo.


### Account live refresh and lazy cloud Library (2026-11-20)

Implemented on `macos-dev`:
- Dedicated JWT-verified `account:subscribe` channel emits `account:changed` invalidations after successful authenticated mutations. Room identity is not trusted for account subscriptions. Token expiry removes subscriptions; reconnect revalidates.
- Mac and web refetch authoritative Library/profile data for the same account. Native updates coalesce briefly, preserving mixed event kinds. Active apps revalidate every 30 seconds and on focus; Library views fetch on entry. Profile views revalidate when opened.
- Cloud index pages contain 40 playlist summaries with counts and preview artwork. Song/album/artist pages and opened-playlist tracks fetch 60 entries at a time. SwiftUI lazy lists/grids render entries as needed. Local MusicKit imports retain their existing local persistence.
- Home and Library expose Refresh (Command-R). Library shows its last update time and Load more. Song search runs against the full cloud catalog. Playlist destination paging is independent from the active song view; chosen songs survive picker searches.
- Active playlist metadata survives first-page refresh; opened tracks refetch, renamed later-page playlists update from their detail response, deleted remote playlists close, and generation/revision guards discard stale account/query results. Queue collection intentionally retrieves remaining track pages before enqueueing.

Verification: signed macOS Debug build passed; 66 native Library checks passed, including paging, selection preservation, remote search, revalidation, stale responses, and account clearing; 34 isolated local HTTP/database/socket checks passed, including same-account invalidation and unauthorized/expired subscription rejection. Backend build and web TypeScript check passed; new account-update and Library web files pass scoped lint. Broader touched web files retain existing lint errors. Runtime GUI inspection was blocked by a macOS Accessibility timeout, so visual confirmation of the running window is outstanding.

Deployment: the backend must run these new endpoints and account events, and the web client must be rebuilt for reciprocal refresh. This change does not deploy production. Existing room playback/socket synchronization remains separate. Local Apple Music copies and per-device appearance preferences are not cloud Library records.


### Library response compatibility and compact rail (2026-11-20)

The locally running server on port 4000 was verified to be the `nodejs-dev` checkout at `/Users/abhinay/orca/workspaces/syncbeats/nodejs-dev`, rather than this `macos-dev` checkout. Its metadata-only playlist response includes `trackCount` but omits `savedYoutubeIDs`, and it has no catalog or paginated track routes. Requiring that field produced the native missing-data decoding error.

Native reads now recognize that response, paginate its playlist summaries locally, and use the older full-detail endpoint when the track-page endpoint is absent. Catalog fallback hydrates one saved collection at a time, with an explicit server-update notice. The newer backend keeps true server paging and account invalidation. A malformed response gets an actionable message while local imports remain intact. The legacy fallback cannot provide instant account events or true network-level track paging; deploying the updated server remains necessary for those features.

Apple Music import was verified in `AppleMusicLibraryImport`, `NativeAppleImportView`, and `NativeLibraryStore.importSelection`: it reads authorized MusicKit metadata and atomically writes account-scoped JSON under the app's `SyncBeats/Library` Application Support directory. It does not upload audio or create backend playlist membership. Import now states that the collection is saved on this Mac. Cloud import remains a separate feature.

Unslop direction: keep the listening desk centered on album artwork, with quiet tools beside it. The prior labeled 176-point sidebar repeated the section names and spent too much width on navigation. The user chose a compact icon rail instead of top navigation. The new 64-point rail preserves Home, Songs, Playlists, Albums, and Artists, adds hover/accessibility labels, and uses the existing gold accent for one active marker. Small or short windows use a horizontal strip. Player, palette, album artwork treatment, and playback controls were not changed by this task.

Validation: 76 native Library checks passed, including old/new response compatibility, ordered detail fallback, bounded legacy catalog fetching, malformed-data copy, and desktop/compact layout fitting. Offscreen navigation renders were produced at 1160×720 and 530×440; the image feed is unreadable here, so direct visual inspection cannot be claimed. Signed build verification is recorded in the implementation checklist.

## Account-backed Apple Music import — 2026-11-20

The Mac checks `GET /api/playlists/apple-music/import` before importing, then saves selected metadata with authenticated `POST` batches of at most 100 songs. Standalone songs use an Apple Music songs collection; selected playlists retain their Apple source IDs. The API derives ownership from the session token and never receives Apple Music audio or database credentials.

A migration adds a stable source ID to each playlist track, unique within its playlist. Per-account transaction locking makes concurrent retries idempotent. Imports update album/artwork/duration metadata and preserve account playlist names, manual additions, and known playback matches. Successfully committed batches remain saved if a later batch fails. Re-importing completes the collection safely. The native app removes selected legacy local copies only after validating every batch acknowledgement; unselected collections and failed imports stay on disk.

The website Songs view reads the paginated account catalog, supports refresh, and resolves metadata-only songs through the existing MusicBridge before queueing. Account library events refresh connected clients. Native Songs, Playlists, Albums, and Artists use the shared account data.

Deployment is required: apply `20261120160000_apple_music_track_identity` with `prisma migrate deploy`, deploy the updated backend and web client, and rebuild the Mac app. The running localhost server belongs to another checkout and has not been modified. No real account library has been imported by this work. The migration and API integration checks were run only against an isolated local test database.

Validation: signed macOS Debug build passed; 92 native Library checks passed (including cloud import, legacy persistence and compact layouts); 24 isolated Apple Music API/database/socket checks and 34 existing playlist regression checks passed. Backend build and frontend TypeScript checks passed. The Songs component lint has no errors and one image optimization warning; the wider existing API file retains unrelated lint errors.
