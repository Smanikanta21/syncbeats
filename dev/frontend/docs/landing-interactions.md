# Landing-page entry and demo

- The website, listening guide, sign-in page, and dashboard share the
  `site-gradient-page` background from `globals.css`. Its fixed pseudo-element
  uses the same glow colors and viewport position on every page. The opaque
  base covers the older global noise layers, while glass cards stay translucent.
  The dashboard owns this background in the session shell, so it also appears
  while authentication loads or the server is unreachable. The room's audio
  visualizer is independent of this background.

- `RoomEntry` keeps room creation, joining, and the demo in the hero. Creation
  uses `/room/default`, which opens the account's persistent room or creates it
  on first use. Joining validates a six-digit code and navigates to that room.
- Existing authentication redirects retain the room in `returnTo`. Email
  registration and the unverified-email branch also carry that room through the
  verification-sent page's login link. That link accepts only local room routes.
- `LiveRoomShowcase` plays three original 16-second synthesized loops. Its
  play/pause state and times come from the audio element. Queue selection,
  seeking, mute, inline load errors, and retry are functional. Device tiles are
  explicitly simulated; they do not measure real multi-device synchronization.
- Audio is requested only after an interaction, starts at 35% volume, and pauses
  when the tab is hidden or the component unmounts. Seeking enables after metadata
  loads. No sign-in, external music service, or autoplay is needed for the demo.
- Regenerate the samples with `python3 tooling/generate-demo-audio.py` (requires
  `ffmpeg`). The checked-in MP3s are about 126 KB each and contain no sampled music.
- The old global dot/ring cursor and its `cursor: none` takeover are removed.
  Website, sign-in, and dashboard pages use matching 32px SVG cursors from
  `public/cursors` on fine-pointer
  devices: an arrow for browsing, a pointing hand for links/buttons, a pressed
  hand while clicking, an I-beam for text inputs, and an open/closed palm while
  hovering/dragging the seek slider. Each has a hotspot at its functional tip
  and a native CSS fallback. Disabled controls and touch retain native cursors.
  Shared rules in `globals.css` cover the whole route, including dialogs outside
  the page wrapper. Busy sign-in controls keep their waiting cursor. Cursors do
  not use JavaScript tracking or animation.

Browser verification covers light/dark themes at 320, 390, and 1440px; touch;
keyboard focus and the Explore menu; invalid/valid room codes; create/join login
destinations; safe verification return links; no media request before interaction;
playback, seeking, mute, queue selection, and a failed media request followed by
retry. Live authenticated room creation still requires an available backend.
