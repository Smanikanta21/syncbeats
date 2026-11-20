# Spotify playlist scale and audio test results

Tested 2026-11-17. User-supplied playlist: https://open.spotify.com/playlist/5U2UK0YSxPLH8t8r4CbZ5O. SyncBeats source: `4dc9a09cb9b97a10719449ed6aaacb7b52c250c9`, plus the new test file. ByTune source inspected: `f60700b351241a0c2c87694c11eae1ffb8bd851b`.

## Result

The source-level 500-track pagination and prefetch checks pass. A real track from the playlist can be found and fetched on the hosted backend, but its audio-format contract fails: WebM/Opus is returned as `audio/mp4`. This is not a completed 500-song live import or a successful native-playback test.

Spotify playlist import retrieves **metadata**, not Spotify audio. SyncBeats and ByTune then match tracks to another playable source. Importing hundreds of titles should not require downloading all their audio before playback begins.

## Live checks

| Check | Outcome |
| --- | --- |
| Public Spotify embed for the supplied playlist | HTTP 200, name `ALL SONGS`, 100 exposed track records. The payload does not establish the playlist's full count; 100 is the public-embed cap. |
| First exposed track | `Aathma Raama` — Brodha V. |
| Hosted `/api/search/youtube?q=Aathma Raama Brodha V` | Ten results; first video ID `pxCWiYFkvTg`, title `Brodha V - Aathma Raama [Music Video]`, duration 3:52. |
| Postman search assertions, normal URL input | Two assertions passed, exit 0: HTTP 200 and nonempty results containing a valid video ID. |
| Hosted audio request for that video, range 0–65535 | HTTP 206 in about 9.5 seconds; declared `audio/mp4`; total file size reported as 3,987,465 bytes. Only 64 KiB was retained locally. |
| Actual audio bytes, examined with ffprobe | `matroska,webm`, codec `opus`. Prefix `1a45dfa3` is an EBML/WebM header. |
| Postman audio assertions, range 0–15 | HTTP 206 and advertised MP4 type passed; MP4-header assertion failed. Two passed, one failed, exit 1. This reproduces the existing format mismatch. |

An initial Postman search using an already percent-escaped URL returned an empty list and failed its nonempty assertion. A raw-input Postman control and both plus/percent-encoded direct HTTP controls returned ten results. This is retained as a request-input/tool variation; it does not establish a production search fault or its cause. Postman runs used `--no-report-events` so results were kept local rather than published to Application Inventory.

Probe artifacts are under `/tmp/syncbeats-spotify-playlist-embed.*`, `/tmp/syncbeats-playlist-track-probe.*`, and `/tmp/syncbeats-postman-playlist-*.json`. These are diagnostic files, not distributed media assets.

## Controlled 500-track checks

Added `dev/frontend/tests/playlistScale.test.mjs`. It compiles the actual TypeScript modules and replaces their network/React boundaries with fixtures. The tests do not copy the application pagination or scheduling algorithms.

| Assertion | Result |
| --- | --- |
| Backup Spotify reader follows five 100-track pages, retaining all 500 in order | Pass; one fixture token request plus five metadata requests, no audio requests. |
| HTTP 429 retries the same page and honors Retry-After | Pass; no skipped or duplicated track. Timer invocation is observed; no real rate-limit wait or upstream limit is measured. |
| Later page HTTP 403 produces a failure instead of silently returning a partial list | Pass. |
| Primary authenticated Spotify reader retains all 500 tracks | Pass; six fixture metadata calls: playlist details plus five track pages. No YouTube search/audio fetch. |
| A 500-track playback queue prefetches only the upcoming track | Pass; one prefetch request. |
| A 500-track queue starts no speculative audio download before current audio is ready | Pass. |

Validation:

- Installed frontend dependencies from its existing lockfile with `npm ci --ignore-scripts --no-audit --no-fund`.
- Full frontend suite: **38 passed, 0 failed**, exit 0.
- Final targeted scale suite after the lint-only helper rename: **6 passed, 0 failed**, exit 0.
- ESLint for the new test file passed after avoiding the reserved `module` variable name.
- No application implementation, database migration, production configuration or deployment was changed.

## Current SyncBeats flow

`MusicBridgeService.getPlaylistMetadata()` tries a connected Spotify user's token, app credentials, a helper API reader, then an anonymous embed fallback. The API readers paginate; the embed fallback explicitly marks the result `capped: true` and exposes up to 100 tracks.

`MusicBridgeRoutes.ts` imports catalog records and playlist links, responds with the imported count, then resolves missing YouTube IDs in a background task. It does not download all imported audio. Database lookups/writes use chunks; the background YouTube matcher is sequential. Neither database throughput nor a full production import was measured here.

`useTrackPrefetcher.ts` selects one upcoming track and waits for current-audio readiness. The new 500-item tests exercise that behavior. Playback/prefetch share the existing download pool, whose pre-existing tests cover duplicate consumers, cancellation, retry and bounded memory retention.

This separation is what makes a large playlist practical:

1. Import all authorized metadata pages.
2. Resolve/cache source identities without fetching every audio file.
3. Fetch the current track and one upcoming track as needed.
4. Reuse cached media; an explicit offline-download feature can enqueue the entire list with bounded workers and cancellation.

## How ByTune handles it

| Operation | Inspected behavior | Source |
| --- | --- | --- |
| Full Spotify metadata | Signed-in Spotify web-session queries read pages of 100; `allSongs()` continues up to `MAX_SONGS = 5000`. | [spotify.ts:137](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/spotify.ts#L137) |
| Public link fallback | Uses the Spotify embed; when a Spotify session is available, attempts the full paginated playlist first. | [spotify.ts:163](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/spotify.ts#L163) |
| Match Spotify metadata to YouTube Music | `useSongMatches()` starts four workers, caches matches and stops starting new work after leaving the page. Matching is metadata discovery, not downloading audio. | [useSongMatches.ts](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/src/lib/useSongMatches.ts) |
| Matching quality | Checks title/version/artist and duration rather than accepting every first search result. | [track-match.ts:84](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/track-match.ts#L84) |
| Explicit offline download | “Download all” acts on matched tracks, skips local/already-downloaded/queued entries and asks for confirmation above its threshold. | [downloads.ts:181](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/src/lib/downloads.ts#L181) |
| Download execution | Two workers, partial files, progress/stall handling and refreshed-URL retries. File extension follows the returned MIME. | [electron/downloads.ts](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/downloads.ts) |

These are source observations; ByTune's authenticated Spotify flow and 500-song downloader were not executed. Its web-session integration is different from SyncBeats' official Spotify OAuth/API path. Copying implementation code also requires respecting ByTune's GPL-3.0 license.

## What remains before claiming reliable large-playlist playback

1. **Fix the confirmed media-format mismatch and existing bad cache hits.** Serve real WebM as WebM for capable web clients; provide validated AAC/M4A for the current native Apple path. Renaming a file is not conversion.
2. Verify the supplied playlist's complete list using an authorized Spotify API/session. The public embed establishes only the first 100; this checkout has no local `.env`/Spotify credentials or authenticated SyncBeats session, so the real protected import was not invoked.
3. Exercise a real authenticated import, database writes, matching progress and resumed/failed imports. Keep caps and unmatched tracks visible instead of silently reporting a complete import.
4. Add matching confidence/version checks and source caching; apply bounded workers/backpressure to optional full offline downloads. Do not start hundreds of audio transfers at once.
5. Test actual playback/seek/reconnect on web and Swift after the format fix. Header/ffprobe checks do not prove audible playback or synchronization.

For a sizing example, if compressed audio averages 4 MB per song, explicitly saving 500 songs is about 2 GB **per device**. That is a reason to make full offline saving an intentional operation, not a prerequisite for importing a playlist.

See [the hosted-download diagnosis](./YOUTUBE_AUTH_DOWNLOAD_DIAGNOSIS.md) and [the open-source launch plan](./OPEN_SOURCE_PLAN.md).

## Hosted frontend recheck — 2026-11-18

Opened `https://syncbeats.in` in visible Google Chrome and used the actual Google sign-in, room, search, queue, and profile controls. This was a deployed-browser check; no application changes or deployment were made.

| Check | Observed result |
| --- | --- |
| Google identity sign-in | Succeeded and entered the user's room. The Google request used `openid email profile`, with `response_type=id_token`. No YouTube account authorization was performed. |
| Supplied Spotify playlist in room search | No playlist import result appeared. This alone does not establish a Spotify backend failure. |
| Profile → Integrations | Spotify displayed a disabled **Coming Soon** button. The current source also disables that button in `app/(session)/profile/page.tsx`. A full authenticated Spotify import cannot be exercised through this deployed UI. |
| Search first playlist song | `Aathma Raama Brodha V` returned the official music video and other results. Added video `pxCWiYFkvTg` to the initially empty queue. |
| Browser playback | Playback started; Chrome reported **Audio playing**, the room reported **Synced & Playing**, and the counter advanced through multiple observations. Pause/resume returned to advancing playback. Lyrics appeared with clickable line controls. These observations do not prove measured lyric timing, audible output quality, or synchronization between devices. |
| Actual frontend audio request | `GET https://api.syncbeats.in/rooms/:room/yt-proxy?videoId=pxCWiYFkvTg` (authentication query omitted) returned 200. DevTools showed a 3,987,465-byte response, `Content-Type: audio/mp4`, a roughly 3.00-second network fetch through the service worker and a roughly 3.29-second frontend fetch. Console reported an IndexedDB miss followed by Stream-and-Stash. This measures loading a previously resolved server-cache item, not cold YouTube extraction. |
| Fresh public audio contract check | Postman requested `/api/search/youtube/download?videoId=pxCWiYFkvTg` with `Range: bytes=0-15`: **2 assertions passed, 1 failed; exit 1**. Status 206 and Content-Range passed; bytes did not match the advertised MP4 container. Reports remained local with `--no-report-events`. |
| Independent bytes/codec check | A separate 64 KiB range probe returned 206 in 2.102 seconds, `audio/mp4`, `bytes 0-65535/3987465`, prefix `1a45dfa39f4286810142f7810142f281`. ffprobe identified **matroska,webm / opus**. This reconfirms the public download mismatch; the authenticated proxy also advertised MP4 with the same total length, but its bytes were not independently ffprobed in this recheck. |

An **Unable to play media** message appeared around pause/resume; subsequent observations showed continuing song playback. DevTools' `NotSupportedError` messages were labeled `[WakeLock] Video fallback play rejected`, identifying the hidden wake-lock video rather than a demonstrated failure of the song's audio decode. The device UI also briefly labeled the paused state **Blocked (Audio Unlock Required)**. Treat these as separate diagnostics until their precise triggers are reproduced.

Other captured diagnostics: a service-worker `ERR_CACHE_MISS` for the room document and a 404 from `/spotify/audio-analysis` for the YouTube track. They did not prevent this song from playing. Spotify metadata/import, Spotify audio analysis, and YouTube audio sourcing are separate paths.

Evidence retained locally: `/tmp/syncbeats-frontend-recheck-audio.json`, `/tmp/syncbeats-frontend-recheck-audio.js`, `/tmp/syncbeats-frontend-recheck-probe.json`, and `/tmp/syncbeats-frontend-recheck-audio.part`. No browser token or raw authenticated HAR was added to these documents.

**Conclusion:** this one-song Chrome flow works, while native Apple compatibility remains blocked by the reproduced container mismatch. No hundred-song live import/download, native playback, second-device sync, or new resolver deployment was tested. Next implement the AAC/M4A contract and expose a complete Spotify import flow before claiming either native or playlist-scale runtime reliability.

## Correction and localhost recheck — 2026-11-19

The user clarified that the intended target was **localhost**, not production. The preceding hosted result cannot describe the current local app. `lsof` confirmed that ports 3000 and 4000 run from `/Users/abhinay/syncbeats/dev/frontend` and `/Users/abhinay/syncbeats/dev/syncbeats-server`, respectively, rather than this Orca worktree. The running checkout is on `macos-dev`, at `4dc9a09c`, with existing uncommitted frontend/native changes. Its live UI differs from the production UI previously tested.

### Local UI issue and change

The visible music search opened in YouTube mode. `SearchTab.tsx` contained a Spotify importer, and the island listened for `island:expand-spotify`, but no visible source selector or event dispatcher exposed that mode. Spotify playlist links pasted in YouTube mode were treated as YouTube queries. The profile's disabled Spotify account-integration button is separate from this public-playlist importer; its **Coming Soon** label does not establish that the importer is absent.

Changed **only** `/Users/abhinay/syncbeats/dev/frontend/components/room/SearchTab.tsx` in the running app:

- Added visible YouTube/Spotify source buttons with pressed and disabled states.
- Recognized public Spotify playlist URLs before source-specific search, so pasting the supplied link in YouTube mode starts Spotify import. Locale paths and share parameters are accepted; the import receives a canonical playlist URL.
- Corrected the scraping-stage label to identify Spotify or YouTube according to the active source.

Chrome visibly showed the new buttons and changed to Spotify mode when importing the supplied link at `http://localhost:3000/room/...`. The Spotify list subsequently showed two **ALL SONGS** cards, with **100 tracks** and **499 tracks**. These are saved metadata/library counts. The 499-track card was not independently associated with the supplied URL in this recheck. The import stream's final event and exact returned count were not captured; do not claim that this run freshly imported 499 tracks or downloaded them. Existing room playback/queue changes from other connected clients were not used as evidence of this import.

### Local audio result

Tested `http://localhost:3000/api/search/youtube/download?videoId=pxCWiYFkvTg`, which uses the local frontend rewrite to the backend on port 4000:

- Initial MP4-only assertions: 2 passed, 1 failed because the local response advertised **audio/mpeg**, not MP4. This assertion was inappropriate for a correctly identified MP3 response; it did not reproduce the production MIME mismatch.
- Corrected MPEG/MP4 signature and range assertions: **3 passed, 0 failed; exit 0**, using Postman with `--no-report-events`.
- Independent 64 KiB request: 206, `audio/mpeg`, `bytes 0-65535/3865977`, ID3 prefix `494433030000000a1776544954320000`.
- That prefix alone did not contain MPEG frames because the file has a large ID3 artwork tag. The complete file was then fetched: 200, **3,865,977 bytes**, about 0.84 seconds for this cached request. ffprobe confirmed **mp3 / mp3**, duration **231.144490 seconds**, plus an attached PNG artwork stream.

This local audio file has a matching MIME and decodable MP3 container. Native rendering and precise sync were not exercised by this probe. It does not establish that all local downloads return AAC/M4A or that the production WebM issue has been fixed. The resolver provider that won this request was not independently identified.

### Validation and remaining limits

- Running frontend type check passed.
- Running frontend suite: **32 passed, 0 failed**. This is the running checkout's suite, not the earlier worktree's 38-test report.
- ESLint comparison against the original `SearchTab.tsx`: both report **30 errors and 21 warnings**, with no new rule/message diagnostics from this change. Lint therefore remains failing on existing code.
- `git diff --check` passed. No commit or deployment was performed.

Local `useTrackPrefetcher` still selects one upcoming track. A playlist's **100** or **499** entries are not a count of downloaded audio files. Public embed fallback is capped at 100 metadata tracks; Spotify API paths follow pagination beyond 100. No hundreds-song live audio batch was performed in this recheck.

Local evidence: `/tmp/syncbeats-local-recheck-audio.json` (initial MP4 expectation), `/tmp/syncbeats-local-audio-contract.json` and `.js`, `/tmp/syncbeats-local-audio-probe.json`, `/tmp/syncbeats-local-audio-full.bin`, and the `/tmp/syncbeats-local-*` frontend check logs. Authenticated browser URLs/tokens were not exported into the report.
