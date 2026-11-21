# Artwork follow-up, 2026-11-21

Artist tiles now use their group's supplied cover before requesting catalog artwork. Album and artist tiles retain a decodable song thumbnail if no catalog cover is available. Library refresh restarts artwork tasks and clears failed catalog lookups. Corrupt HTTP image responses are rejected before entering the image cache.

The video embed remains hidden behind static artwork until YouTube reports playback. Its origin and widget referrer identify SyncBeats. Provider error codes are logged without song IDs, authentication headers or media URLs, distinguishing rejected embeds from autoplay failures while preserving native audio.

Validation:

- 48 account/artwork checks passed, including supplied artist artwork without catalog access, album thumbnail fallback, retry after a missing match, and recovery from a corrupt image response.
- Real WebKit provider-failure and timeline checks passed; a live public YouTube video played muted.
- Signed macOS Release and generic iOS builds passed. The mobile checkout excludes the separate, uncommitted Mac list/gallery layout changes.
- Live artwork HTTP requests in the corrected Mac returned 200. Complete user-library coverage and the user's specific video remain unverified.

Two Mac bundles were running during diagnosis: the Xcode build and the older local `releases/macos/1.0-beta.1` build. The older bundle predates the recent artwork/video changes. The local release bundle is updated from the verified signed build; this does not publish a new release.
