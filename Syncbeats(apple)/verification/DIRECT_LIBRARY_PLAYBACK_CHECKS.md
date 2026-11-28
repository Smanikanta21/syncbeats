# Direct library playback, 2026-11-22

Removed the Apple Music "Choose a room version" confirmation. Selecting a song resolves and remembers its room version automatically, preserving the original title and artist. Existing room versions skip another lookup. Play and queue actions use the same resolver.

The selected song starts before following songs resolve. Following songs enter the queue individually in playlist order while native audio plays. A new selection invalidates the prior sequence, preventing delayed old results from being queued. Playback changes still round-trip through Socket.IO and authoritative room snapshots.

Validation: 98 library checks and 79 audio checks passed, including automatic match persistence, original metadata, cached version reuse, selected-song rendering before the following match completes, and cancellation of delayed old queue work. Signed macOS Release and generic iOS builds passed. Tests used a stable source snapshot because other UI files were being edited concurrently.

The audio checks ran against the real backend Room state object on a local Socket.IO fixture and the repository Postman audio simulation. They exercise the native playback pipeline with synthetic audio; actual Apple Music matching quality and hardware synchronization remain outside this check.
