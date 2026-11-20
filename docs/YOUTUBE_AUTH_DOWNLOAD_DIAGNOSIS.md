# YouTube suggestions, Google verification and hosted downloads

Investigated 2026-11-17 using the reverse-engineer-anything skill. ByTune source identity: `f60700b351241a0c2c87694c11eae1ffb8bd851b`; SyncBeats source identity: `4dc9a09cb9b97a10719449ed6aaacb7b52c250c9`. The user identified the failing environment as the **hosted website/backend**.

Complete source trees were available, so the skill directs ordinary source tracing rather than REA setup/decompilation. This investigation additionally performed limited local extractor probes and HTTP requests to the owned hosted service. No Google account was signed in, no private cookies/tokens were acquired, no application configuration or deployment was changed, and no open-source publication was performed.

## Findings

1. **ByTune's Google sign-in is app-account login.** The inspected code does not connect its Google/Supabase credentials to the YouTube Music session.
2. **Suggestions have several independent sources:** anonymous regional YouTube Music discovery, typeahead, selected-track radio and ByTune's own taste/history model.
3. **OAuth verification is separate from fetching media.** Current SyncBeats Google login verifies an ID token; it does not request YouTube account access. Additional YouTube scopes and branding have different verification requirements, and neither verification nor an API key grants audio-download capabilities.
4. **A hosted format bug was reproduced:** SyncBeats returned WebM/Opus bytes with an MP4 MIME type. Its fallback/cache handling can persist an incompatible format under an `.m4a` filename.
5. **Local and hosted architectures have different failure conditions.** ByTune resolves/downloads on the listener's desktop. SyncBeats downloads through a shared cloud backend, with short extractor deadlines, fallback services, shared load and potentially address-bound upstream URLs.

## Google sign-in and suggestions

### What ByTune actually does

| Feature | Observed path | What it establishes |
| --- | --- | --- |
| Google sign-in | `electron/supabase.ts:424–437` invokes Supabase Google OAuth with a browser account chooser; `512–534` exchanges the callback for a Supabase session and creates/loads the ByTune profile. | Authenticates a ByTune account. The function contains no explicit extra YouTube scopes. Google provider settings outside this repository remain unknown. |
| YouTube session | `electron/music-service.ts:116–155` uses country, language, anonymous visitor data and a PO token. | An independent InnerTube session. No Google/Supabase credentials are passed to these constructors. |
| Search typeahead | `music-service.ts:507–521`; `electron/ytm.ts:67–72` executes `/music/get_search_suggestions` with `input` and `client: YTMUSIC`. | Search suggestions for a query; not access to the user's private YouTube history. |
| Regional home feed | `music-service.ts:684–702` calls `yt.music.getHomeFeed()` and handles shelves/continuation. | YouTube Music discovery in the selected market, without evidence of authenticated account personalization. |
| Track radio | `music-service.ts:824–840` executes `next` with `videoId`, `RDAMVM${videoId}`, automix settings and continuation. | Related/autoplay tracks seeded by the selected track. |
| Personalization | `src/lib/recs/profile.ts:548–574` consumes ByTune play history, likes, playlists, followed artists, searches, skips, journal and hidden artists. `feed.ts:257–269` combines that profile with artist bundles and regional discovery. | A ByTune taste model; signing in can make the app's own account data available without importing YouTube Music account recommendations. |

The bounded search of `electron/supabase.ts` and `electron/music-service.ts` found no integration using `provider_token`, `provider_refresh_token`, a YouTube OAuth scope, `SAPISID`, `Cookie` or `Authorization` to personalize that InnerTube session. This does not prove what is configured in a live Supabase/Google dashboard.

Pinned source links:

- [ByTune Google sign-in](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/supabase.ts#L424)
- [YouTube session](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/music-service.ts#L116)
- [Typeahead endpoint](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/ytm.ts#L67)
- [Home feed](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/music-service.ts#L684)
- [Track radio](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/music-service.ts#L824)
- [Taste profile](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/src/lib/recs/profile.ts#L548) and [feed assembly](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/src/lib/recs/feed.ts#L257)

### Does SyncBeats need Google verification?

`dev/syncbeats-server/src/auth/AuthService.ts:190–201` verifies a Google **ID token**, extracts identity fields and logs the user into SyncBeats. `AuthRoutes.ts:99–109` accepts the `credential` used for this flow. This alone does not provide a Google API access token or permission to read a YouTube account.

| Intended feature | Google requirement / limitation |
| --- | --- |
| Current identity login | Configure the Google client, authorized web origins/domains and identity flow correctly. Basic identity login is different from requesting sensitive YouTube data. |
| Production app name/logo on the OAuth consent screen | Google's current brand-verification guidance describes a separate branding process, domain verification and homepage/privacy links. Review the project's Verification Center; the current dashboard status was not inspected. |
| Public search/discovery through supported YouTube Data API endpoints | Enable the relevant API, use the API key/quota correctly and follow its policies. Public metadata requests do not by themselves import private account data. |
| Access to a user's YouTube account, e.g. permitted account playlists/subscriptions | Request only the necessary OAuth scopes, such as `youtube.readonly` where appropriate. External production use of sensitive scopes generally requires scope verification unless an exception applies; confirm classification and requirements in the console. |
| The user's personalized YouTube Music home recommendations | Do not assume an OAuth scope exposes this. The public Data API is not the private YouTube Music home API. Official `activities.list` documents `home` as deprecated and says user home-page activity data is unavailable through that API. |
| Audio-only downloading/offline playback | Verification and the Data API do not provide a general audio-download endpoint or permission. YouTube's API developer policies restrict downloading/caching audiovisual content without prior written approval, audio/video separation and offline/background features. |

Current official documentation was fetched during this investigation:

- [Google identity overview](https://developers.google.com/identity/gsi/web/guides/overview)
- [Sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [YouTube scope descriptions](https://developers.google.com/identity/protocols/oauth2/scopes#youtube)
- [YouTube authentication](https://developers.google.com/youtube/data/guides/authentication)
- [Deprecated home activity parameter](https://developers.google.com/youtube/v3/docs/activities/list#home)
- [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)

For SyncBeats-style recommendations, start with SyncBeats' own listening history/likes plus permitted regional/related discovery. `HistoryRoutes.ts` already has listening-history routes. A recommendation layer does not need to pretend app login grants YouTube Music account access.

## How ByTune downloads

`electron/downloads.ts` runs on the listener's computer:

1. Queue the selected video ID with a concurrency cap of two.
2. Resolve a fresh stream using `resolveStream(track.id, true, maxKbps, true)`. The final argument asks the audio picker for MP4-compatible output, and the resolver retains MIME, rendition ID and content length.
3. Fetch into a hidden partial file using HTTP ranges. Monitor stalls and progress rather than killing all work solely because the complete download took ten seconds.
4. On failure, retry with a newly resolved URL. Resume only when rendition identity/length still match; truncate and restart if the source changed.
5. Choose `.webm` when the stream MIME indicates WebM/Opus, otherwise `.m4a`; write metadata tags for M4A and rename the completed file to its destination. Update the local download registry used by offline playback. This path does not transcode WebM into AAC: its M4A tag writer explicitly avoids ffmpeg and copies the media bytes through.

This path normally fetches the selected media bytes directly; it does not use SyncBeats' cloud yt-dlp/RapidAPI pipeline. Its MP4 preference still has a fallback if no compatible rendition exists, and its filename follows the returned MIME instead of blindly declaring every file M4A. It is not a model of guaranteed codec enforcement; format information and byte validation still matter.

Evidence: [queue and policy](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/downloads.ts#L1), [range/stall handling](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/downloads.ts#L186), [resolve/retry/finalization](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/downloads.ts#L300).

## Hosted SyncBeats: observed and inferred issues

### H1 — Reproduced format mismatch

Test resource: the public Blender Big Buck Bunny video `YE7VzlLtp-4`. The hosted endpoint was:

`https://syncbeats.in/api/search/youtube/download?videoId=YE7VzlLtp-4`

Only byte ranges were retrieved, not a complete local download:

| Check | Observation |
| --- | --- |
| Backend health and same-origin `/api/health` | Both returned HTTP 200. This is not a blanket backend outage. |
| First audio request, range 0–4095 | HTTP 206 after about 12.4 seconds; declared `audio/mp4`; range `bytes 0-4095/9730538`. The duration includes this probe's network/server work and is not a general latency benchmark. |
| Header bytes | Begin `1a45dfa3`, an EBML/WebM header, rather than an MP4 `ftyp` header. |
| Confirmation, range 0–65535 | HTTP 206, still `audio/mp4`; header contains `A_OPUS`. |
| `ffprobe` on the retained 64 KiB prefix | Format `matroska,webm`; stream codec `opus`, type `audio`. |
| Prefix SHA-256 | `7942f6c2065cedf10768b730c39042c488f9ca96285d9b4442704e8a46a75aa1` |

The prefix and sanitized probe summary are retained under `/tmp/syncbeats-hosted-audio-probe.part` and `/tmp/syncbeats-hosted-audio-probe.json`.

Source corroboration:

- `SearchRoutes.ts:458` selects `bestaudio[ext=m4a]/bestaudio/best`: falling back permits WebM/Opus or other formats.
- Cache output is always named `<id>.m4a` (`409–411`), regardless of selected fallback container.
- Cache validity primarily checks file size (`417–425`); size does not prove codec/container.
- `sendCachedAudio()` (`558–574`) distinguishes MP3 signatures but labels other bytes MP4. It does not recognize the reproduced WebM header.

This is a real format-contract bug. Some browsers can decode WebM/Opus despite the misleading type; others or native media paths may fail. Apple's AVAudioEngine path specifically cannot treat WebM as native AAC/M4A. It does **not** prove this is the only cause for the user's unspecified failing track. The exact winning download branch and deployed code revision require logs/build identity; those were not available.

### L1 — Extractor configuration changes available formats

Using local Homebrew yt-dlp `2026.10.21`, two **metadata-only** probes used the same test video and format selector. No Google cookies were supplied and no audio was downloaded locally.

| Probe | Result |
| --- | --- |
| Current direct-resolver clients `mweb,ios,android`, with Node JS runtime | Succeeded in about 4 seconds, but exposed four formats and selected format 18: a combined MP4 video/audio rendition. Warnings said mweb HTTPS formats lacked a GVS PO token, and some iOS/Android formats lacked URLs under SABR behavior. |
| Default client selection resembling the full downloader | Succeeded in about 3.9 seconds, exposed 49 formats and selected format 258, AAC/M4A audio. |

This shows the hard-coded client restriction can discard useful formats on this local probe. It does not measure the deployed host, prove a global bot block, or justify assuming all upstream sessions behave the same way.

### Other source-supported risks

| Finding | Evidence / confidence | Work needed |
| --- | --- | --- |
| Fixed ten-second full-download cutoff | `SearchRoutes.ts:453–473`; observed code. | Separate resolution, transfer-progress/stall and overall budgets. Cold starts or larger tracks should not fail solely because the entire transfer takes ten seconds. |
| Different extraction policy for resolution and full download | Direct resolution has specific clients and `--js-runtimes node`; full download uses different/default behavior. Current Dockerfile **does install Deno**. | Use one tested extraction policy and report selected runtime/client. Do not misdiagnose missing Deno from the current Dockerfile. |
| Direct 302 URLs can fail across network addresses | `RoomRoutes.ts:807–832` resolves on the server and redirects a room member to the CDN; inference, not exercised here because no room/session was used. | Treat URL lifetime/address binding as part of the source contract. Server-minted URLs may not be usable from a different device egress address. Verify with deployment logs before attributing a particular 403 to this. |
| Platform-specific binary discovery | `SearchRoutes.ts:275–292` selects by file existence, with a tracked macOS binary among candidates. Container has a separate yt-dlp installation/symlink. | Prefer a configured/verified executable or tested PATH discovery; log version/platform safely. A bare Linux checkout must not select an incompatible Mac artifact. |
| Fallback bytes validated mostly by size | `SearchRoutes.ts:478–509`, `fetchViaRapidAPI():576–605`; observed code. | Validate container/codec and source response before admitting data to cache. Return correct MIME, and convert only where permitted/needed. |
| Many unique concurrent server downloads | Per-ID in-flight deduplication exists; no global download-worker limit was found in this handler. ByTune caps workers at two. | Add a bounded queue, playback priority, backpressure and cancellation. Same-track deduplication does not limit a burst of different tracks. |
| Weak error diagnosis | Several fallback errors are swallowed; route ultimately uses generic unavailable/restricted errors. | Classify extraction failure, missing format, upstream rejection, timeout, decoder mismatch and cache corruption separately. Redact signed URLs/cookies/tokens in logs. |
| Duplicate download route | `SearchRoutes.ts:178` and `214` register the same GET path; the first sends the response without delegating. | Consolidate the handler so validation/error behavior has one owner. This is cleanup, not a proven cause of the tested mismatch. |

Shared cloud addresses are a plausible source of upstream throttling/rejection, unlike each ByTune installation's local network. That remains a hypothesis here: no production extractor stderr, rate-limit trace or failing user track was supplied. This report does not propose defeating access restrictions or obtaining users' browser cookies.

## Work plan before open-source launch

### 1. Fix the reproduced format contract first

- Introduce a shared media result: actual container, MIME, codec, rendition identity, byte length, expiry and resolver/source identity.
- For native-compatible cached output, require AAC/M4A or convert a permitted source into it using a supported ffmpeg path. Merely renaming WebM to `.m4a` does not convert it.
- If web playback intentionally supports WebM/Opus, retain its real extension and MIME (`audio/webm`) and negotiate native capability separately.
- Validate completed files and cached hits by actual bytes/container/codec. Reject HTML/error payloads. Recognize existing mislabeled WebM files and rebuild or explicitly convert them; changing the future selector alone leaves bad cache hits behind.
- Keep partial output private and atomically promote only validated files. Preserve HTTP 206 seeking and same-track request deduplication.
- Test MP4/AAC, WebM/Opus, MP3, incomplete files and large HTML error bodies. Verify headers match bytes and that native-only requests never receive WebM.

### 2. Make hosted failures observable and bounded

- Use a shared resolver configuration for metadata/direct resolution/downloads, with current tested yt-dlp/runtime versions and supported formats.
- Report stage and failure category; store enough redacted diagnostics to identify the winning fallback. Add deploy/build identity and tool versions to safe internal diagnostics.
- Replace the fixed full-transfer cutoff with stage budgets and a progress-based stall timeout; align browser/native request budgets with the backend's behavior.
- Add bounded worker concurrency, playback priority and cancellation; meter optional fallback usage rather than starting paid fallbacks blindly for every request.
- Reproduce any actual failing user track on both local and hosted paths; compare extractor stderr, format metadata and response signatures. Do not infer an IP block from a generic 502.

### 3. Choose supported media boundaries

Google verification cannot make the unofficial extraction pipeline a supported YouTube audio API. Define product scope for uploaded/owned/licensed audio and provider integrations with appropriate permissions. Official embedded YouTube playback has different control/scheduling limits and should not be advertised as automatically meeting the same sample-accurate synchronization target as native audio files.

Keep core sync independent of provider availability. A failed external resolution should produce a useful retry/change-track state rather than corrupting a cache or stopping unrelated participants.

### 4. Add recommendations independently of account permissions

- Define separate interfaces for query suggestions, regional discovery, related-track radio and the user's SyncBeats taste profile.
- Reuse SyncBeats' own listening history/likes; add explicit skip/follow signals only with a clear product purpose.
- Build a useful cold-start feed from permitted catalog discovery, then blend personal signals as history accumulates. Region/language and own history should have clear provenance.
- Use bounded caching, debouncing, deduplication and network-failure fallbacks. Treat timings/ranking weights as design choices, not facts copied from ByTune.
- Do not add YouTube OAuth scopes unless a supported account-data feature actually requires them.

### 5. Resume the open-source setup

After format/reliability fixes are reviewable and the local demo is reproducible, follow [OPEN_SOURCE_PLAN.md](./OPEN_SOURCE_PLAN.md). Existing publication gates remain: historical-secret review, visualizer admin-session remediation, licensing/ownership, safe setup and fork-safe CI. This investigation does not complete those gates.

## Coverage and remaining unknowns

The later playlist-scale run is recorded in [SPOTIFY_PLAYLIST_TEST_RESULTS.md](./SPOTIFY_PLAYLIST_TEST_RESULTS.md). It adds six source-level scale checks, a passing 38-test frontend suite and a live format-mismatch reproduction on a track from the supplied Spotify playlist.

Answered: implemented ByTune sign-in/suggestion/download paths; current SyncBeats identity flow; applicable Google verification distinctions; a reproduced hosted MIME/container mismatch; local format-selection differences; concrete remediation steps.

Partially answered: the user's general hosted-download failure. One test track downloaded successfully but returned a wrongly typed format. No specific failing user track/error, authenticated room flow, production logs or deployed commit identity was supplied. Per-track upstream failures, quota/403 causes, actual browser decoding behavior and native end-to-end timing still need targeted validation.

No ByTune binary or signed-in runtime was executed. No private recommendation feed was observed. No application code was modified or fix deployed in this investigation. ByTune code remains GPL-3.0; implementation work must respect its license and third-party media/provider rights.
