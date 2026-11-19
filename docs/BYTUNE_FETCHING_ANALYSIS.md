# ByTune: YouTube Music and lyrics fetching

Audit date: 2026-11-17. Repository: https://github.com/Smanikanta21/ByTune.
Source inspected: `main`, commit `f60700b351241a0c2c87694c11eae1ffb8bd851b` (package version 1.1.1).

The requested reverse-engineer-anything skill was applied. Because this target supplies a complete source tree, the skill directs ordinary source inspection rather than REA setup or decompilation. Findings below establish implemented paths, not successful execution of a downloaded release or current availability of external providers. The checkout used for inspection is `/tmp/syncbeats-bytune-investigation`.

## How YouTube Music is fetched

ByTune is an Electron app. Its React renderer calls a narrow preload IPC API; the Electron main process does catalog requests and audio resolution. It uses **`youtubei.js` / InnerTube**, rather than the official YouTube Data API, for these paths. This is the internal API used by YouTube clients. Catalog discovery and playable audio resolution are separate operations.

```mermaid
flowchart LR
  UI[Search or select a song] --> IPC[Electron preload / IPC]
  IPC --> Catalog[YouTube Music internal search / browse]
  Catalog --> ID[Video ID and track metadata]
  ID --> Resolver[Audio stream resolver]
  Resolver --> CDN[Temporary Google audio URL]
  CDN --> Proxy[Loopback HTTP proxy]
  Proxy --> Player[Audio element and Web Audio]
```

1. **Catalog:** `electron/ytm.ts` calls `yt.actions.execute("search", ...)` and `"browse"` with `client: "YTMUSIC"`. It parses the response renderers into songs, albums, artists, playlists and continuation pages. These catalog results provide identities and metadata; they are not audio files.
2. **Session:** `createSession()` bootstraps visitor data, obtains a proof-of-origin (PO) token when possible, and constructs a playback-capable InnerTube session. Country and display language are included in the session.
3. **PO token:** `electron/po-token.ts` fetches a YouTube homepage challenge (with an `att/get` fallback), runs BotGuard through `bgutils-js` in **JSDOM**, sends the result to `GenerateIT`, and mints a visitor-bound token. The implemented cache duration is three hours. This token is not an API key or subscription. The separate `po-page.ts` browser script must not be confused with the active JSDOM path imported by the music service.
4. **Resolve:** `resolveStream(videoId)` calls `getBasicInfo()` using a rotating client list: `VISIONOS`, `IOS`, `ANDROID_VR`, `WEB`, `YTMUSIC`, `ANDROID`, `TV`. It tries two rounds, rebuilding the session/token before the second. If these attempts fail, it tries configured Piped instances.
5. **Choose audio:** `audio-format.ts` ranks audio renditions and uses the library's player decipher support where needed. It applies quality ceilings, prefers ordinary/original renditions over DRC alternatives when available, and can request MP4/AAC for downloads. Streaming can use Opus/WebM. It returns MIME, loudness and rendition identity as well as URL.
6. **Validate and cache:** the resolver probes the URL using an open byte-range request and checks that audio bytes can be read. Concurrent requests share an in-flight resolution. Cached URLs expire before the upstream URL's own expiry, with a safety margin.
7. **Play:** the renderer receives a localhost proxy URL, rather than a raw upstream URL. The proxy resolves the track, forwards range requests, streams upstream bytes and re-resolves after an upstream 403. It also refuses a continued byte range if the underlying rendition changed, avoiding a corrupted seek.

Ordinary playback is streaming. Download/local-library paths are separate. The code does not establish that every song is available, that these unofficial API routes will keep working, or that a particular client always succeeds.

### Audio evidence

All links are pinned to the inspected commit:

| Finding | Source |
| --- | --- |
| InnerTube dependency | [package.json](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/package.json) |
| Internal catalog search and browse | [ytm.ts:49](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/ytm.ts#L49) |
| Client list and session construction | [music-service.ts:58](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/music-service.ts#L58), [music-service.ts:116](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/music-service.ts#L116) |
| Challenge, JSDOM, integrity token and PO minting | [po-token.ts:1](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/po-token.ts#L1), [po-token.ts:187](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/po-token.ts#L187) |
| Rendition selection and URL TTL | [audio-format.ts:69](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/audio-format.ts#L69), [audio-format.ts:138](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/audio-format.ts#L138) |
| Probe, fallback and resolution | [music-service.ts:1100](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/music-service.ts#L1100), [music-service.ts:1181](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/music-service.ts#L1181) |
| IPC returns a proxy URL | [main.ts:623](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/main.ts#L623) |
| Loopback server and 403 recovery | [stream-proxy.ts:24](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/stream-proxy.ts#L24), [stream-proxy.ts:244](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/stream-proxy.ts#L244) |

## How the lyrics can look accurate

ByTune is not deriving all lyrics from the audio using speech recognition. It obtains existing lyric documents from several services and renders their timing information. Accuracy depends on two things: matching the **same recording/edit**, and obtaining good timestamps for that recording.

### Recording identity and fetching

`music-service.ts:getLyrics()` accepts the video ID, title, artist, album and duration; it can enrich missing credits from YouTube Music. Local files can supply embedded lyrics. Its cache retries line-only answers after ten minutes instead of retaining a weaker result indefinitely.

The provider layer starts a BiniLyrics recording-identification lookup. It can identify an **ISRC**, which identifies a recording rather than merely a song title. lrc.red can then fetch `https://lrc.red/s/{ISRC}.ttml`; LyricsPlus can search using that code. Those lookups have a bounded wait; the other providers proceed without waiting for recording identification.

The inspected provider priority is:

1. lrc.red
2. BiniLyrics
3. BetterLyrics
4. Portato
5. PaxSenix
6. LyricsPlus
7. Unison
8. The playing YouTube video's captions
9. YouTube Music's Lyrics tab
10. KuGou
11. LRCLIB
12. Musixmatch
13. Genius (lazy plain-text fallback)

Most providers start concurrently, but results are consumed **in priority order**, not by whichever returns first. The non-lazy sweep has a 12-second ceiling; identification, individual fetch timeouts and lazy Genius can add time, so this is not an end-to-end latency guarantee. The current `getLyrics()` caller sets `prioritizeWordSync: false`: the first accepted timed result can win even if it has line timing only. This is not a guarantee that every play gets word timing.

Matching normalizes upload labels, titles, credits and scripts, checks recording/version words such as live/remix/sped-up, and uses duration where available. Providers have different tolerances. A rejected candidate falls through rather than being accepted solely because it was the first search hit.

### Timing and display

- **TTML / karaoke / enhanced LRC / rich-sync:** these formats can contain word or syllable boundaries. The parsers normalize them into lines and words with times in seconds. Some syllable pieces are joined into words while retaining their timing spans.
- **Ordinary LRC:** supplies line timestamps. It does not inherently provide the exact moment each word is sung.
- **Plain lyrics:** displayed as text; zero-timestamp LRC is classified as plain text rather than pretending it is synchronized.
- **Captions:** can provide timed text for the specific video, but captions may be missing, incomplete or inaccurate.
- **Renderer:** the karaoke sweep follows the actual playback position using `requestAnimationFrame`. Valid word spans are clamped to the line window; malformed spans fall back to an even distribution. Instrumental gaps are represented explicitly. Line focus anticipates the lyric timeline by 0.35 seconds, which is a presentation choice, not improved underlying timestamps.
- **Offsets:** per-track nudges and a device offset align the lyric timeline to playback, including uploads with extra intros. An offset corrects a constant shift; it cannot repair a different-speed remix or bad individual timestamps.

Therefore, provider-supplied word timings explain the strongest karaoke effect. Some visible timing is repaired or estimated. Source availability, matching quality and timing quality remain separate uncertainties.

### Lyrics evidence

| Finding | Source |
| --- | --- |
| Metadata enrichment, cache and current priority option | [music-service.ts:950](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/music-service.ts#L950) |
| Recording/version matching | [lyrics.ts:390](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/lyrics.ts#L390) |
| Gaps and plain-text classification | [lyrics.ts:453](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/lyrics.ts#L453) |
| TTML parser | [lyrics.ts:803](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/lyrics.ts#L803) |
| LRCLIB matching | [lyrics.ts:1528](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/lyrics.ts#L1528) |
| ISRC documents and recording identification | [lyrics.ts:1596](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/lyrics.ts#L1596), [lyrics.ts:1854](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/lyrics.ts#L1854) |
| Ordered concurrency and provider list | [lyrics.ts:2555](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/lyrics.ts#L2555), [lyrics.ts:2601](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/electron/lyrics.ts#L2601) |
| Timing repair, playback clock and word-only sweep | [SyncedLyrics.tsx:69](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/src/components/SyncedLyrics.tsx#L69), [SyncedLyrics.tsx:238](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/src/components/SyncedLyrics.tsx#L238), [SyncedLyrics.tsx:419](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/src/components/SyncedLyrics.tsx#L419) |
| Persisted track/device offsets | [lyricsOffset.ts](https://github.com/Smanikanta21/ByTune/blob/f60700b351241a0c2c87694c11eae1ffb8bd851b/src/lib/lyricsOffset.ts) |

## What to take into SyncBeats

The current SyncBeats `dev/frontend/components/room/SyncedLyrics.tsx` already fetches LRCLIB, cleans YouTube-style metadata and prefers duration matches. Its ordinary-LRC branch estimates words from character lengths and a capped vocal window (`107–125`); this is not provider word timing. Enhanced LRC has a separate real-timestamp path. Existing parser checks exercise intro/gap/offset handling.

Recommended independent implementation:

1. Move metadata normalization and provider matching into reusable modules. Preserve title, primary artist, album, duration, recording/version and ISRC when supplied. Use a canonical track identity rather than title alone.
2. Return a typed lyric document with `provider`, `recordingId`, `timingQuality: word | line | plain`, `timingOrigin: supplied | estimated`, normalized seconds and attribution. Avoid presenting an estimated sweep as real word timing.
3. Start with stronger LRCLIB exact matching plus a permitted TTML/word-timed provider adapter. Add further providers only with verified access/redistribution terms, useful coverage and failure tests. Do not copy the entire fallback list merely because it exists.
4. Cache by provider and recording/version identity, deduplicate concurrent requests, bound latency and retry weaker results. If lyrics are shared by a room, choose one document/version so participants do not select different lyrics independently.
5. Render against the existing synchronized media position. Keep recording-intro offset distinct from device output latency and room clock offset. Lyrics fetching must never block playback readiness.
6. For audio, separate catalog metadata, stream resolution and byte serving behind a source-adapter interface. Keep expiry recovery and format identity explicit. Prefer platform-supported AAC/M4A for the Swift AVAudioEngine path; WebM/Opus is not a drop-in native format.
7. Preserve SyncBeats' working HTTP 206 audio-serving behavior. ByTune's localhost proxy solves an Electron-specific problem; transplanting it into a cloud/browser system without examining CORS, SSRF, bandwidth and expiring/IP-bound URLs would be the wrong architecture.

ByTune is licensed **GPL-3.0**. Studying behavior and independently implementing an interface is different from copying code. Copying or adapting its code requires satisfying that license and preserving applicable notices; it cannot simply be relabeled as MIT/Apache-2.0. Open-source software licensing also does not grant rights to redistribute third-party audio or lyric catalogs.

## Verification boundary

For the follow-up investigation of Google sign-in, suggestions and a live hosted audio-format bug, see [YOUTUBE_AUTH_DOWNLOAD_DIAGNOSIS.md](./YOUTUBE_AUTH_DOWNLOAD_DIAGNOSIS.md).

This is a static source investigation. No ByTune release was executed and no live provider availability, success rate, timing error or end-to-end latency was measured. ByTune's fixture tests were inspected, not executed in this dependency-free checkout. SyncBeats' existing lyric parser checks passed when `npm test` was attempted; the other six test files could not load because `typescript` is not installed in this worktree. That dependency failure does not establish a functional regression.
