# Static artwork recovery and video covers

Library album/artist previews prefer a track with remote artwork instead of the first alphabetical song. Native discovery recovers from a failed cover using a fresh catalog match and keeps an available source preview while matching. Album cards match the album and credited artist; artist matching supports multi-artist labels without accepting unrelated album names.

The expanded player has an opt-in **Video cover** switch. It embeds the queued song's YouTube video muted, follows the room position, and returns to artwork while paused, inactive, reduced-motion, below the 200px embed minimum, or when embedding fails. Lyrics, queue, devices, equalizer and native room audio remain available. The video is embedded rather than imported or downloaded; the matched upload is not guaranteed to be an official music video.

## Verification on 2026-11-21

- 44 native account/artwork checks, including expired-cover recovery, available group artwork, collaborator matching and rejection of unrelated albums.
- 27 real local Apple Music import/catalog HTTP checks, including cover selection for album and artist groups.
- Real WebKit with a controlled player: muted-before-play ordering, timeline correction and provider-error reporting. Eligibility checks cover pause, background, reduced motion, invalid IDs and short windows.
- Real YouTube iframe played a public test video muted on this Mac. This verifies the embed and mute state, not every song's availability or exact audio/video alignment.
- Signed macOS Debug and unsigned generic iOS Debug builds passed; backend TypeScript passed.

Apple Music import success was confirmed by the user in the corrected Mac app. Actual iPhone/iPad installation, locked-device behavior and complete live library artwork coverage remain unverified. Separate local song-row changes and documentation cleanup are excluded from these commits.
