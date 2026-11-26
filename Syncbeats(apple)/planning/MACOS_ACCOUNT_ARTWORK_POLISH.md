# Account pages and discovery artwork

Implemented on `macos-dev`, 2026-11-20. Design process: unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.

## Direction

- Product: shared listening across a Mac and its connected room devices.
- Character: warm, orderly, precise.
- World: an album collection within the existing dark studio / light gallery palette.
- Moments: actual cover images, with restrained colour sampled from their pixels.
- Signature: the connected room remains visible beside account navigation.

This pass keeps the existing player. Artwork glow is an explicit user request, confined to discovery images instead of surrounding navigation and panels.

## Artwork diagnosis and changes

The original artist cards displayed initials without requesting an image. They now resolve an album belonging to the matching artist, with caching and US/IN storefront fallback. These are album covers, not claimed artist portraits.

Direct inspection reproduced ten missing images in an A. R. Rahman song search. Real result titles included `A.R. Rahman - Tere Bina | Lyrical Song | ...`, `ROCKSTAR: Kun Faya Kun (Full Video Song) | ...`, and long jukeboxes. Uploader fields contained record-label channels such as T-Series and Sony Music India. The existing album resolver treated these long titles and channels as recording identities and discarded all video thumbnails.

Discovery now has its own identity matcher. It removes presentation labels and cast suffixes, handles soundtrack prefixes and collaborative artists, and requires artist evidence before choosing a matching recording. Remix identities remain distinct. Supplied video artwork appears promptly while a matched album cover loads. Jukeboxes and mixes retain their source image instead of receiving an arbitrary album cover. Missing source images can use the video's standard thumbnail. The player keeps its existing artwork path.

Empty album fields no longer mask later valid image fields. Artwork decodes into bounded thumbnails away from the UI thread. Colour is sampled from actual image pixels; a small neutral shadow and restrained cover-colour glow surround each image. Settings can disable the glow.

## Account and responsive layout

The account monogram opens a custom popover with Profile, Settings and Log out. Profile and Settings are full pages with a Home return, one column in compact windows, two columns where space permits, wrapping values and scrollable content.

Profile saves the display name through authenticated `PATCH /auth/me`, with input validation, saving/error feedback, and guards against late responses after logout. Settings exposes persisted appearance, artwork glow and Dynamic Island preferences, existing music interests/activity controls, room/device status, macOS Sound settings and account information. Privacy changes use the existing authenticated music preferences API.

The window minimum is 520 × 420. Header and discovery spacing adjust to compact widths. Account pages remain reachable during room or music-interest loading. The existing player footer, expanded player, floating player, full-screen player and equalizer UI files remain unchanged from this task's baseline. Concurrent notch and audio-spectrum edits were preserved.

## Verification

- Signed macOS Debug build passed using the same DerivedData directory as the user's Xcode build.
- 39 native checks passed: cover field selection, artist identity, caching/coalescing, storefront fallback, real decorated search titles, wrong-artist/remix rejection, source-image fallback, colour extraction, authenticated profile saving and error/race handling, persisted settings, and Profile/Settings fitting at 960, 520 and 360 points.
- The running app's cache contained valid 600 × 600 images for all twelve visible artist cards. After loading the updated build, accessibility confirmed `Album artwork by ...` for each card.
- The original ten missing song images were reproduced in the running app. After the final rebuild, a repeat search returned no matches and subsequent window observations were inconsistent. Song matching and source fallback passed regression checks using those real title patterns; final live verification of every search image remains incomplete.
- Profile, Settings and the account popover opened in the signed-in app without changing account details or preferences.
- The standalone Library HTML demo retains its player and includes the artwork treatment and preview account pages. Apple Music import and HTML playback are simulated; native MusicKit import remains a separate pending feature.
- Additional browser checks passed for preview profile saving, theme/glow controls, no horizontal overflow and an unchanged player footer at 960 × 720, 520 × 420 and 360 × 360, with no JavaScript errors.
- Screenshot output was unreadable. Accessibility, decoded image data and layout checks establish behavior; a pixel-level visual review remains pending.

Run native checks with `python3 'Syncbeats(apple)/verification/run-native-account-artwork-checks.py'`. The runner uses SocketIO build products from `/tmp/syncbeats-ui-polish-build/Build/Products/Debug`, or `SYNCBEATS_BUILD_PRODUCTS`.

Existing Swift 6 isolation warnings in `NativeRoomAudio.swift` remain outside this UI pass; the configured Swift 5 build succeeds.
