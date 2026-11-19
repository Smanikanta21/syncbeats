# Localhost audio, session and island checks

Verified 19 November 2026 in `/Users/abhinay/syncbeats`, branch `macos-dev`, base commit `4dc9a09c`. Frontend and backend run on ports 3000 and 4000. These runtime results describe that localhost checkout. The pre-production transfer and release checks are recorded in `PREPROD_RELEASE_CHECKS.md`.

## ByTune's streaming path

Inspected ByTune source commit `f60700b351241a0c2c87694c11eae1ffb8bd851b`:

- `electron/music-service.ts` resolves YouTube audio with youtubei.js/InnerTube, tries client variants and fallback sources, and probes an audio URL before returning it. Resolution results are cached until an expiry safety margin, and concurrent requests share pending work.
- `electron/stream-proxy.ts` starts an HTTP proxy on `127.0.0.1`. The renderer receives a local proxy URL. The proxy forwards byte-range requests and streams the upstream response body, instead of requiring the entire track first.
- A forbidden upstream URL (HTTP 403) triggers re-resolution. Byte-range offsets must refer to the same encoding: when that cannot be maintained, the proxy rejects the request so the player can reload at its current position.
- The service uses YouTube session/token handling and fallbacks; it is not simply placing a permanent YouTube CDN URL in the browser, and this path does not depend on RapidAPI.

These are source findings. A fresh upstream YouTube stream was not verified in this run. Desktop Electron's network/session environment is also different from a hosted backend.

## Changes made locally

- The login page now shows session validation and navigation progress. A failed network check preserves the saved token and offers retry. Session validation uses the existing authenticated `/api/auth/me` request, with a 10-second timeout. Cancelled/obsolete validation cannot restore a previous session after token changes.
- HTTP audio uses the website's `/api` proxy. Saved local audio URLs containing an old private LAN address are normalized to that proxy in development. External CDN URLs and production source URLs retain their original destination.
- Room websockets remain direct in development, using the website's current hostname on port 4000. Next's websocket proxy timed out in this environment; the direct connection returned a valid clock pong.
- Lyrics requests use `/api/lyrics`, with bounded upstream time and a stable unavailable response. LRCLIB itself returned a connection reset from this machine; the proxy returned 503. This does not establish that lyrics are now available.
- Wake lock is acquired only for an active, visible page, coalesces simultaneous requests, and releases late acquisitions after unmount. The unsupported video fallback was removed. Browsers without native Screen Wake Lock will not keep the screen awake through this hook.
- Island modes and tabs transition sequentially. Expanded panels reserve a 48-pixel header and a bounded scrolling body. Playback controls use a centered three-column layout; join requests have their own row. One playlist import progress panel replaces repeated spinners/percentages. Background prefetch progress yields to foreground tasks.
- `/stream-test` uses native browser audio controls and `preload="metadata"`, with no full-file JavaScript decode step. It is isolated from room playback. The pre-production version places this page behind the existing authenticated session layout so it can be tested after deployment.

## Verification

- Frontend typecheck passed and all 41 tests passed. Tests include viewport/header sizing, background-progress priority, saved LAN URL handling, visibility/unmount wake-lock races, and saved-token transmission with the session timeout.
- Backend typecheck and existing room queue/playback/persistence tests passed.
- Telemetry returned 201 with `{ "ok": true }`; all three Postman assertions passed. Two fixture batches were confirmed in the local database and removed by their exact test session/room identifiers. Missing body returned 400 with the expected error; both validation assertions passed (Postman uses a nonzero exit for the HTTP error).
- Local cached audio through port 3000 returned 206, `audio/mpeg`, `Content-Length: 16`, and valid `Content-Range` for `Range: bytes=0-15`; four Postman assertions passed. This proves range support for this cached track, not uninterrupted playback of uncached YouTube tracks.
- A second probe requested bytes `1000000-1000015` and also received 206 with exactly 16 bytes, demonstrating a forward-seek range. The file total was 3,865,977 bytes. The first development-proxy request took 4,293 ms and the following seek request took 344 ms; two requests are not a startup/performance benchmark.
- `/login` and `/stream-test` returned 200; the session-check state was present in the rendered login HTML.
- New route/test-page/audio-source/wake-lock files and the login page passed targeted ESLint. Existing lint failures remain elsewhere. Island diagnostics decreased from 29 errors/9 warnings to 28 errors/9 warnings; SearchTab remained at its existing 30 errors/21 warnings.
- `git diff --check` passed.
- Pixel layout, actual streamed playback, and phone login were not verified: browser capture failed, and incoming screenshots were tiny black images. The test page is ready for a real browser/device check.

## Proposed streaming rollout

1. Use `/stream-test` to check desktop Chrome and mobile Safari: startup, forward/backward seeks, stall recovery, screen hide/show and network changes. Keep ordinary synchronized rooms on their current audio renderer during the comparison.
2. Add a backend stream resolver/proxy trial for uncached songs. Keep upstream credentials and expiring URLs on the server, forward range headers, refresh forbidden/expired resolutions, and maintain the selected encoding during seeks. Compare it with the existing download-and-cache path on the actual hosted backend.
3. Test playlist imports as metadata plus lazy resolution/prefetch of a small upcoming window. A 100/499-track playlist count does not mean all of those files have been downloaded. Avoid starting hundreds of simultaneous stream resolutions/downloads.
4. Compare room readiness, startup delay, seeks and measured drift before changing synchronized playback. A native streaming player is not automatically a substitute for the WebAudio/AVAudioEngine scheduling model. Swift's native audio path requires compatible AAC/M4A or decoded PCM; WebM/Opus cannot be handed directly to Core Audio.

No commits, deployment, production database migrations or room queue changes were performed.
