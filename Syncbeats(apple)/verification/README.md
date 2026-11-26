# Native verification

## Mac branch review — 2026-11-19

The Mac Debug build and unsigned Release build passed. Local verification passed 30 account checks, 21 home API checks, 19 artwork checks, 41 audio/Socket.IO checks, 47 room/controller checks and 16 native notch-window checks. The loaded player remains ready and unblocked after room snapshots, pause and reconnect. The auth runner now includes NativeDiagnostics and is executable.

Backend migration, ranking and authenticated API persistence checks passed against an isolated local PostgreSQL database. The staged server source also passed typecheck, build and room tests. Sixteen queue/player renders were checked for compact queue access, text bounds, insets and the empty state. These results cover local fixtures and structural rendering; live providers, production account flows and physical multi-device audio timing remain unverified by this review.

## Music interests and first-party recommendations — 2026-11-19

The Mac home and web search share the rules-v1 interest profile/feed. New users can select languages/artists or skip; explicit feedback shapes artist discovery. Activity learning starts off. This first version opens music search from artist suggestions rather than producing a licensed song catalog or fetching private provider recommendations.

The extended local Postman simulation passed 20 native home HTTP checks and 19 local artwork checks, including profile serialization, reload, reset, unauthorized and malformed-feed responses. The backend ranker/API also passed separate local PostgreSQL tests. These establish the exercised local contracts, not production account or playback integration. Debug build passed. Eight interest/feed layouts rendered at 720×560 and 1000×800 in both themes; image forwarding did not provide usable visual inspection, so those renders are not a claim of completed on-device visual review.

After building the backend, generate fixtures from its actual catalog/ranker and render only the recommendation views:

```sh
node make-music-taste-fixture.cjs
SYNCBEATS_BUILD_PRODUCTS=/tmp/syncbeats-recommendations-build/Build/Products/Debug python3 render-native-layouts.py --interests-only
```

See [the engine design and rollout notes](../../dev/syncbeats-server/src/recommendations/README.md). The new migration has been validated locally but has not been applied to the configured remote database.

## Home, player, and original album covers — 2026-11-19

The native home/player port builds in macOS Debug. Verification passed 13 home HTTP checks, 21 artwork checks (including real Apple metadata and a decoded 600-pixel cover), and 44 room/notch/floating lifecycle checks. The home and artwork harnesses run the actual Swift sources against the local simulation. Cover mismatch, live/remix variants, missing artist recovery, source continuity after enqueue, concurrent request coalescing, malformed/503/no-result responses, and credential isolation are covered. These results do not establish live account, room Socket.IO, provider-wide catalog coverage, MusicKit, LAN, or local audio behavior.

From this folder, start the simulation:

```sh
postman simulation run postman/simulations/native-room-home.sim.yaml \
  --port 5277 --no-history --output ndjson > /tmp/syncbeats-native-home-simulation.ndjson
```

Then run:

```sh
python3 run-native-home-checks.py --live
SYNCBEATS_BUILD_PRODUCTS=/tmp/syncbeats-native-home-build/Build/Products/Debug python3 run-room-checks.py
SYNCBEATS_BUILD_PRODUCTS=/tmp/syncbeats-native-home-build/Build/Products/Debug python3 render-native-layouts.py
```

Omit `--live` to keep provider checks local. Build products may be overridden with `SYNCBEATS_BUILD_PRODUCTS`. The renderer seeds review-only data in a temporary copy of RoomSession; production has no fixture adapter. [cover-fixtures.json](./cover-fixtures.json) contains verified Apple artwork URLs for After Hours, Dive, and Con Todo El Mundo. Rendering those covers accesses the public CDN. Layouts are written to `/tmp/syncbeats-native-layouts`, including home boundaries, empty rooms, expanded artwork/compact queue, floating players, and notch views. PNG generation passed, but image forwarding did not provide usable visual inspection; on-device review remains necessary. The generic AppIntents metadata and offscreen sandbox-extension messages do not indicate a compile failure.

---

## Room and notch verification — 2026-11-16

The later notch refinement replaced the standard rounded rectangle with mirrored concave top shoulders and separated `IslandShape`/`NotchMotion` from the controller. One `CADisplayLink` drives panel geometry and view presentation, replacing the mismatched AppKit/SwiftUI animation clocks. The room/notch harness now passes **30 checks**, including outward-curve containment, continuous camera coverage, anchored intermediate frames, spring settling, direction reversal, no closing undershoot, and immediate Reduced Motion behavior. The signed Debug build passes. Updated compact/expanded native renders retain the artwork, controls, next-track row, and room action inside the sculpted outline; physical motion remains an interactive review item.

The signed Debug macOS build passed. Launching it against `localhost:4000` restored the local account directly into the native room; accessibility inspection showed the real current track, queue count, connected state, and this Mac labeled `Controls only` in Devices. Playback commands are server-authoritative; AVAudioEngine and MusicKit are not implemented by this milestone.

`python3 run-room-checks.py` compiles the actual room models/session and notch geometry against the existing Debug Socket.IO package products. Fifteen checks passed for queue/current/upcoming selection, milliseconds-to-seconds conversion, paused/playing/clamped timelines, non-optimistic commands, disconnect cleanup, empty rooms, camera gap geometry, anchored expansion, and external-display coordinates. These are state/geometry checks, not end-to-end playback tests.

`render-native-layouts.py` now also renders room views at 720 × 560, 960 × 720, 1512 × 982, and 1920 × 1080, empty rooms, and compact/expanded notch views. Fictional tracks are confined to `RoomFixtures.swift` in this verification folder. Production data is never seeded. Small/short room layouts keep transport and progress controls below the scrolling content. The renderer disables app/network lifecycle work and never creates a production notch overlay. Set `SYNCBEATS_BUILD_PRODUCTS` if package products are in another DerivedData folder.

The native panel uses an explicit `constrainFrameRect` override, `NSHostingView.safeAreaRegions = []`, and a SwiftUI root that ignores container insets. The camera gap is applied exactly once by `NotchGeometry`. After the safe-area correction, the live debug log reported an actual 332 × 38 compact panel with a 220-point camera gap and top edge at 1169 points. The current computer-use provider could inspect the main room but did not enumerate the status-level panel; hover/pin/Escape, full-screen Spaces, display hot-plug, and physical pixel alignment still need interactive review on the user's screen. Offscreen notch renders verify content layout only.

The existing local Postman simulation was reused; all 30 authentication checks passed again. Its request log confirmed login success/failure, signup, verification/resend, reset, restoration/default-room retrieval, bearer/device headers, and no automatic write retries. Live email and Google provider return were not exercised. No backend code or production deployment changed.

---

This local Postman fixture models the checked-in `AuthRoutes.ts`, `AuthService.ts`, and `RoomRoutes.ts` contracts. It never calls a provider, creates an external account, or sends email. The Postman CLI was signed out, so owner-mock discovery was skipped. Unmodeled endpoints return 501.

From this folder, start Postman CLI 1.80.0 or newer:

```sh
postman simulation run postman/simulations/native-auth.sim.yaml \
  --port 5169 --no-history --output ndjson > /tmp/syncbeats-native-simulation.ndjson
```

In a second terminal:

```sh
zsh run-native-auth.sh
```

The harness compiles the actual app's configuration, API, Keychain store, OAuth callback validation, and app model. It injects isolated preferences and an in-memory session store for fault cases, then tests Keychain separately with a unique service and cleans up. Requests use real URLSession HTTP with the simulation's `auth-service` route prefix. One-port routing is used because this client does not expose a forward-proxy setting.

On 2026-11-15, all 30 checks passed. The request log showed login success/401/503, registration 201/409, session restore 200/401/503, reset success/failure, resend, Google token exchange, and default-room retrieval. Seven login attempts produced seven requests. The delayed login response arrived after the client timeout; it did not sign the app in or cause an automatic retry. This verifies client behavior under the modeled conditions, not live provider behavior.

For UI review, launch the app against this server:

```sh
open /tmp/syncbeats-native-preview/Build/Products/Debug/Syncbeats.app \
  --env SYNCBEATS_API_URL=http://127.0.0.1:5169/auth-service
```

The original preview build used ad-hoc signing. Debug now omits the associated-domain entitlement by default for free Personal Team development; Release retains it. Google sign-in checks the per-configuration availability flag before opening a browser. A paid-team signed build with the domain entitlement and deployed website association is required for the production OAuth return.

Manual review still needed: launch centering, all three intro cards, both appearances, 720 × 560 and larger windows, signup/error-state scrolling, Tab/Return navigation, VoiceOver, reduced motion, and live account/email/Google return. Native launch and intro controls were observed through accessibility. Screenshot display was unusable and the capture system subsequently returned `SCStreamErrorDomain -3811` (audio/video capture failure), so full visual verification could not be completed. OCR of the user's original screenshot confirmed the text/illustration columns and navigation positions; the revised centering was checked in source. The installed simulator was incompatible with Xcode, so no iOS run was verified.

Stop the foreground simulation with Ctrl+C. Runtime logs belong in `/tmp`, not Git. See [the simulation context](postman/simulations/native-auth.context.md) for the exact evidence and unresolved assumptions.

## Native layout artifacts

After building the Debug app, run:

```sh
python3 render-native-layouts.py
```

This compiles the actual SwiftUI views into a separate local renderer with an empty session store and isolated preferences. It draws owned offscreen `NSHostingView` windows into PNGs under `/tmp/syncbeats-native-layouts`, without driving the user's windows or calling external accounts. When available, the script copies assets from `/tmp/syncbeats-personal-team-build/Build/Products/Debug/Syncbeats.app/Contents/Resources/Assets.car`. `ImageRenderer` alone omitted the scroll views and native text fields, so the final utility uses native view bitmap rendering.

Artifacts cover small/default/large introductions, small/default/wide login, narrow stacked login, and light signup. Full-screen cases include 1512 × 982, 1920 × 1080, and 2560 × 1440, plus full-screen introduction and signup. They support checking rendered geometry; they do not verify keyboard interaction, actual scrolling, OAuth, or iOS behavior.

On 2026-11-16, the shared `EntryLayout` refinement expanded the composition with both available width and height: compact panels retain the 1080-point cap, while spacious panels grow toward 1480 and increase typography/control sizes. The generated 1920 × 1080 login view places story text around 15% and the form heading around 60% of window width, inside the larger panel. Login actions appeared at around 68% of screen height; full-screen signup's action appeared around 73%, and intro navigation around 77%. The 1512 × 982 and 2560 × 1440 renders also retained visible login actions. Compact 720 × 560 login and 960 × 720 signup retained visible actions. These are native offscreen layout observations using OCR, not an interactive full-screen test. The signed Debug macOS build and `git diff --check` passed after the refinement.


### Native notch window verification

After a Debug macOS build, run:

```sh
SYNCBEATS_BUILD_PRODUCTS=/tmp/syncbeats-macos-ui-build/Build/Products/Debug \
  python3 run-notch-checks.py
```

This runs the actual panel and display-link controller with local fixtures, without authentication or playback commands. It briefly shows an overlay, dispatches mouse clicks into the cap center below the camera, verifies opening, second-click closing, interrupted motion, frame dimensions, open-room dismissal, hide and reopen, then removes the overlay. Room checks also cover compact workspace boundaries and device-name shortening. The native layout renderer includes both themes at 720 × 560 and window sizes on either side of the sidebar boundary.


The panel checks also assert that the final window level remains above the system menu bar. Assigning `level` before `isFloatingPanel` resets it to the ordinary floating level and prevents reliable cap interaction; the check guards against that ordering regression.


Automatic-dismissal checks cover pointer exit, cancellation when the pointer returns, loss of panel keyboard focus, app deactivation, and foreground-app changes. They use the real panel with local fixtures and isolated notifications; no account or playback commands are sent.

## Loader layouts — 2026-11-19

Run `SYNCBEATS_BUILD_PRODUCTS=/tmp/syncbeats-native-home-build/Build/Products/Debug python3 render-native-layouts.py --loader-only` for ten account-free loader renders: section, inline, 37% progress, static motion, and busy buttons in both palettes. The static-motion flag exercises the same rendering branch used by reduced motion without changing system settings. See [UI_CONSISTENCY.md](../../docs/UI_CONSISTENCY.md) for web validation and the preview.
