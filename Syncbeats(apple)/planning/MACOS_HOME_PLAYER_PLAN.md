# SyncBeats macOS home and player

Prepared: 2026-11-17. Branch: `macos-dev`.

Status: native SwiftUI home/player implemented on 2026-11-19, including original album artwork resolution. The HTML prototype retains the same direction. Preview: [macos-home-discovery.html](./macos-home-discovery.html).

## Recommended layout

Make music discovery the main room view after login. Keep the existing permanent-room entry flow and charcoal, ivory, gold palette. Search stays above the scrollable feed. A bottom mini-player stays visible while users browse; clicking its artwork/title opens the room player. The queue button opens the shared queue directly.

Home shows recommendations, recently played tracks, and optional curated selections. Search replaces the same feed with results instead of opening a separate section. Clearing search restores home. Keep room code and device access in the top chrome.

The expanded player shows artwork, transport, progress, and queue. In compact and floating modes, Player/Queue tabs keep both views accessible. Only the queue list scrolls within these compact player modes. Floating mode is an explicit user action; the HTML demonstrates a movable pane inside the preview. Native implementation should use a separate player window sharing the same room session.

## Responsive behavior

Breakpoints use the app's content bounds, including when the window is manually resized.

| Content width | Devices | Player |
| --- | --- | --- |
| 1100 px and above | Optional docked rail alongside the feed | Artwork and queue together |
| 880–1099 px | Optional drawer over the feed | Artwork and queue together |
| Below 880 px | Close rail automatically; hide its opener; show shortened device labels below transport | Player/Queue tabs |

At heights of 620 px or less, hide the featured selection and shorten the heading area so recommendation artwork and track names appear immediately. Search and the bottom player remain outside the feed's scroll region. Adapt card columns and hide secondary controls as width decreases; keep play/pause, next, track identity, and queue access available.

Translate these CSS measurements to native content points after accounting for the macOS title bar. Match behavior at the actual minimum window size rather than relying on preset names.

## Data and native integration

- `GET /search/recommendations` returns `{ sections: [{ title, tracks }] }`. It provides Trending and, with `userId`, Recently Played from that user's listening history. Track fields include `youtubeId`, `title`, `artist`, `thumbnail`, and `duration`. This is not YouTube-account personalization.
- The current recommendations route accepts a caller-supplied `userId` without route authentication. Before native integration of personal history, derive that identity from an authenticated server session. Trending can load independently.
- Reuse native `RoomSession.search()` with authenticated `GET /rooms/:roomId/youtube-search?q=...` and its existing request-generation guard. Search suggestions can use a debounced query and recent searches; no dedicated suggestions endpoint was verified.
- Reuse authenticated `POST /rooms/:roomId/enqueue-youtube` for recommendation and result actions. Playback, seek, queue changes, and volume must continue to round-trip through the existing room protocol. Update the UI from authoritative snapshots.
- The Mac is currently a room controller. Label connected ready players accurately; local audio playback depends on the separate AVAudioEngine work.

## Implementation order

1. Add recommendation models and a cancellable service. Handle loading, empty, offline, and retry states; cache successful results. Bind recent history to authenticated identity.
2. Replace the native workspace's separate search navigation with the persistent search field and home/results feed. Keep MusicKit access available through existing library controls.
3. Extract the current playback controls into a shared bottom player and expanded player, both observing the same `RoomSession`.
4. Add compact Player/Queue switching, the adaptive devices rail/drawer, and shortened device labels. Close drawers on window shrink and move focus to a visible control.
5. Add a separate floating player window with shared state, explicit close/expand actions, and restored focus. Keep this independent of the Dynamic Island and its existing automatic dismissal behavior.
6. Verify native builds and existing room/notch checks, then test a live room with connected devices: queue, play/pause, seek, volume, reconnect, search cancellation, and window resizing.

## Prototype verification

The standalone HTML embeds artwork, logo, styles, and scripts. Its catalog and device state are illustrative; controls simulate playback and make no API, authentication, or audio requests. The genre filters and curated selection are design fixtures, not claims about available recommendation endpoints.

Headless Chrome passed 27 browser checks covering fixed search/player positioning, device layouts, search suggestions and keyboard selection, empty results, filters, refresh, shared playback/queue state, expanded and floating player transitions, compact queue access, focus handling, decoded artwork, and absence of runtime errors or external requests. Layout checks at 420, 760, 1000, and 1500 px found no horizontal page overflow or player/search controls outside the app bounds. At 720 × 560, the first recommendation row's names fit above the player.

Screenshots, DOM measurements, and screenshot text recognition were used for verification. No native build was required for this HTML-only addition.


## Prototype refinement — 2026-11-18

Preserved the discovery layout, existing palette, self-contained artwork, and expanded/floating player modes. Refined the shared queue and playback feedback:

- Upcoming tracks can be reordered by dragging, move buttons, or Option + arrow keys. The current track stays anchored. Queue rows show track durations and total remaining time.
- Discovery cards show a checkmark for queued tracks. Add/remove actions update both the cards and queue, with feedback naming the track.
- Recently played reflects session history. Previous restarts the current song after three seconds, or returns to the prior track near the start. Shuffle randomizes upcoming tracks while preserving the current song and queue membership.
- Slash focuses search; the existing Command/Control + K shortcut remains available. Space toggles playback when focus is outside interactive controls. Seek and volume sliders announce useful values, and mute labels reflect the current state.

Verification: JavaScript syntax check passed. Seventeen browser-event checks passed for queue mutation and ordering, drag guards, shuffle membership, history, previous-track navigation, mute, search, and player-mode transitions. DOM layout checks passed for Home and the expanded queue player at 420 × 660, 720 × 560, 880 × 660, 1099 × 720, 1100 × 720, and 1500 × 880. Checked app/control bounds, horizontal overflow, and decoded embedded artwork; browser console contained no errors. These checks used browser DOM events and measurements, not native pointer automation or live playback.

This remains a simulated HTML preview. SwiftUI implementation and native audio, discovery, history, and library integrations remain separate work.


## Native implementation — 2026-11-19

Implemented the discovery/search home, fixed mini-player, expanded artwork/queue view, reusable floating NSPanel, and responsive device rail/drawer. All modes share RoomSession and send existing server commands. Discovery uses authenticated room search queries; personal history uses the authenticated history endpoint, not the caller-selected userId on /search/recommendations. Queue play waits for the returned enqueue item; reordering waits for a server resync. The current queue track is protected. Queue rows show duration and known remaining time. Command-K focuses search; queue move controls support Option-arrow keys. The HTML slash/Space shortcuts and compact queue in the floating panel remain future native refinements; its queue button restores the main window directly to the queue.

Artwork prefers supplied albumArt, rejects YouTube video frames, and otherwise matches artist/title to Apple song metadata for 600-pixel album covers. Public YouTube oEmbed can recover missing queue metadata; its thumbnail is never used. Shared metadata and image caches coalesce requests across Home, queue, mini/expanded/floating players, and notch. Missing or unmatched metadata keeps the brand placeholder. Artist and version checks guard against unrelated covers. Discovery metadata is retained by source ID when enqueueing omits the artist. The HTML's eight covers are embedded from original music artwork; Open Eye Signal now uses Immunity and Feather uses Modal Soul.

Verified: macOS Debug build; 13 native home HTTP checks against the local Postman simulation; 21 artwork checks including live Apple lookup and 600-pixel image decoding; 44 room/notch/floating lifecycle checks. Native layouts rendered at compact, drawer, dock, short, and full-screen bounds, with expanded/compact-queue/floating modes in both palettes. Image forwarding in this environment did not provide usable visual inspection, so rendered PNGs are available for review but are not evidence of a completed on-device visual pass. Native AVAudioEngine, MusicKit library UI, and hybrid LAN playback remain separate pending work.

Final artwork verification: all eight prototype covers decoded at 600 × 600. After reloading the existing Orca preview, all 15 rendered artwork instances loaded at that resolution, with no horizontal overflow. Thirty-three native PNG layouts were generated; visual capture limitations described above still apply.

## Shared loader — 2026-11-19

Replaced default SwiftUI progress spinners with NativeLoader and its compact button signal. The web LoadingPage uses the corresponding React component. Both reuse Linked Play geometry, a 1.8-second trace cycle, the charcoal/ivory palette, and reduced-motion/static states. See [UI_CONSISTENCY.md](../../docs/UI_CONSISTENCY.md) for the implementation, verification, and wider web/Mac UX differences. [Loader preview](./macos-loader-preview.html).
