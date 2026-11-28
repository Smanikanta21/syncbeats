# Queue and Autoplay verification

November 22, 2026 · `macos-dev`

Clicking a Home or Library song queues the songs after it in that displayed list. The selected song starts first; following songs resolve and append without undoing manual queue order. A late lookup can continue a finished selection, while Pause and replacement selections cancel that continuation.

Autoplay is a shared room setting, defaulting to on. Turning it off retains Now Playing and Up Next at completion. Manual Next still plays. The setting is stored in the existing serialized queue document; no database migration is needed. Older queue documents default to on.

The compact and full-screen players use one scrollable queue: History above Now Playing, then Up Next below it. History runs from oldest to newest, placing the most recently played song nearest Now Playing. Opening the queue starts at Now Playing (or Up Next if nothing is selected); scrolling upward reveals history. Later track changes do not reset the user's scroll position. iOS rows use native press-and-hold dragging with a cover preview; Mac rows expose a drag handle. Dropping above/below a row or at the end sends the existing authenticated reorder request. Now Playing and History cannot be reordered. Screen-reader move actions are also available.

Verified:

- 91 native audio checks against synthetic audio and the real backend Room state machine.
- Home queue order, automatic continuation, Autoplay off, manual Next, late resolution, Pause cancellation and replacement cancellation.
- Reorder snapshots preserve Now Playing; songs can move to the beginning/end of Up Next.
- Index mapping rejects moves into Now Playing or played history.
- Server checks cover serialization, legacy defaults and duplicate completion notifications.
- Signed macOS Debug/Release and signed iPhone builds; generic iOS build covers the universal iPhone/iPad target.
- Rebuilt Xcode Release app running on the Mac: the full-screen queue exposes Now Playing, Up Next, drag handles and accessible move actions. The live server correctly leaves Autoplay on and disables changing it until its capability update is deployed. This was an accessibility inspection, not a physical drag-gesture test.
- Signed iPhone build installed successfully. Launch was denied while the phone was locked; touch-drag testing remains pending. The iPad is unavailable and has not received this build.
- Stopped the owned local audio simulation and room fixture after verification.

Reproduce from the repository root with the local audio simulation on 4189 and room fixture on 4190:

```sh
node 'Syncbeats(apple)/verification/queue-autoplay-checks.cjs'
postman simulation run 'Syncbeats(apple)/verification/postman/simulations/native-audio.sim.yaml' --port 4189 --output ndjson --no-history
node 'Syncbeats(apple)/verification/native-playback-room.cjs'
SYNCBEATS_BUILD_PRODUCTS=/tmp/syncbeats-autoplay-mac/Build/Products/Debug SYNCBEATS_PLAYBACK_TEST_URL=http://127.0.0.1:4190 python3 'Syncbeats(apple)/verification/run-native-audio-checks.py'
```

The live backend must deploy the `room:toggleAutoplay` handler and `autoplay` snapshot field to enable changing the switch. On older servers, the app displays the existing on state and disables the unsupported action. Physical iPad installation and touch-drag QA remain unverified because the iPad is unavailable.
