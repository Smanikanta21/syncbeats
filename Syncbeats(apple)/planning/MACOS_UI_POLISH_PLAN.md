# SyncBeats macOS UI polish implementation plan

Prepared: 2026-11-16. Branch: `macos-dev`.

Next home/player proposal: [MACOS_HOME_PLAYER_PLAN.md](./MACOS_HOME_PLAYER_PLAN.md), with an interactive [HTML boilerplate](./macos-home-discovery.html). The home/player port and original album artwork resolver are implemented as of 2026-11-19; see the linked plan for validation and pending native playback work.

Status: HTML prototype and native SwiftUI polish implemented on `macos-dev`; Debug build, 30 existing room/notch checks, and native layout rendering passed. Live room verification remains limited by the unavailable local Debug backend.

## Scope and evidence

Polish the current native SwiftUI desktop app in `Syncbeats(apple)/Syncbeats/Syncbeats`. Start with the listening room, Find music, and Devices; then carry shared controls into the notch companion, introduction, and account screens. Preserve the existing screen order, features, studio dark/gallery light compositions, Linked Play mark, system fonts, and gold accent. The selected appearance in [SWIFT_DESKTOP_PLAN.md](SWIFT_DESKTOP_PLAN.md#selected-appearance-studio-dark-gallery-light) remains the design reference.

The running app's accessibility tree confirms the listening-room navigation, room-code action, queue, transport, device count, appearance controls, and notch toggle. Screenshot capture returned a blank image twice, so color, spacing, and motion findings below are source-derived, not a completed visual review. Search, Devices, account, and notch states were inspected in source rather than exercised live. Earlier build claims in the native rebuild plan were not revalidated in this planning pass.

`macos-dev` was created from the local `nodejs-dev` HEAD. Existing native and web changes carried into the branch; the branch is not an isolated copy of those changes. Do not stage, discard, or rewrite unrelated work during polish.

## Proposed direction

- **Product:** SyncBeats lets people choose music and control one shared listening room across connected players; this Mac currently acts as a room controller
- **Character:** Warm, measured, tactile
- **World:** A listening studio: record sleeves, dark equipment, ivory paper, and a restrained brass detail
- **Moments:** Current-track artwork and the selected queue row carry the richness; the surrounding controls stay quiet
- **Signature:** The real room code paired with a readable connection state makes the shared listening room recognizable

Polish mode: the product already has an identity and a selected appearance. Refine its craft without introducing a new composition or visual system. Keep the green-black undertone in dark mode and warm ivory in light mode; reduce their saturation where large surfaces compete with artwork. No generated artwork is needed for this app pass.

## Audit

Each row records one sign and where it appears. Source paths are relative to `Syncbeats(apple)/Syncbeats/Syncbeats`.

| Finding | Location | Planned correction |
| --- | --- | --- |
| Spacing uses unrelated steps such as 27, 19, 7, 22, 26, and 42 | `Features/Room/RoomWorkspaceView.swift`: sidebar, player, search, content edges | Consolidate on a 4-point scale; allow 2-point optical adjustments inside controls |
| Large green-tinted surfaces dominate the dark ramp | `DesignSystem/NativeTheme.swift`: background, panel, raised | Move toward charcoal within the selected studio palette; keep the undertone and ivory light mode |
| Every shared separator is gold at 20–24% opacity | `DesignSystem/NativeTheme.swift`: `line` | Use a neutral text-derived separator at 6–10% opacity; reserve gold for actions/selection |
| Gold appears on chrome that does not express selection or priority | `RoomWorkspaceView.swift`: waveform, search symbol, room-code container, device status | Make ordinary icons/meta secondary; retain gold for meaningful actions and selected states |
| Icon sizes vary through 11, 13, 15, and 19 points | `Features/Room/RoomComponents.swift`, room menus, notch controls | Use SF Symbols consistently with standard 16/18-point roles; allow explicit transport/notch exceptions |
| Labels are uppercase and widely tracked | `RoomWorkspaceView.swift`: YOUR SPACE, SYNCBEATS / TOGETHER, ON THE TURNTABLE | Use sentence case and zero tracking on small labels |
| Repeated room headlines and promotional phrases compete with music | `RoomWorkspaceView.swift`: sidebar, heading, empty player; notch empty copy | Use short context labels: Listening room, Now playing, Queue; preserve helpful instructions |
| Functional text is often 9–11 points | Room headings, progress, connection badge, notch metadata | Use 12–13-point desktop metadata and 14-point body/rows; keep compact notch text at least 11 points |
| Narrow rail, mixed row density, and geometry formulas need a resizing review | `RoomWorkspaceView.swift`: 190-point sidebar, player/queue breakpoints | Tune existing proportions and minimum sizes without replacing the layouts |
| Queue count is padded and small status information receives accent treatment | Room queue heading and `RoomConnectionBadge` | Use unpadded counts and tabular time/code figures; make state labels readable and secondary |
| Some fixed transport sizes fall off the spacing scale | `RoomComponents.swift`: 42/54-point play control | Use explicit compact/full sizes on the scale with adequate hit targets |
| Notch expansion uses an underdamped spring with overshoot | `Features/Notch/NotchMotion.swift` | Review the visible transition; reduce bounce while preserving interruptibility and camera-safe geometry |

No emoji icons, purple gradients, gradient text, decorative blobs, invented sync charts, or arbitrary looping artwork motion were identified in the inspected room components. The record fallback is product-specific and stays. Its small tonal gradient and the artwork's neutral shadow are not automatically defects. Shared gold-button gradients need a contrast/visual check before deciding whether to flatten them.

## Implementation order

### HTML review prototype

Open [macos-ui-polish.html](macos-ui-polish.html) directly in a browser. It is one self-contained file with embedded iTunes album artwork, studio dark/gallery light switching, Listening room/Find music/Devices navigation, local search, queue actions, and simulated transport. No audio, authentication, API calls, or native notch window is implemented in the HTML; the preview notice stays outside the app chrome. The original HTML concepts and native sources are preserved.

Validation on 2026-11-16: Chromium rendered dark/light and compact captures. Interaction checks passed for appearance/state preservation, play/pause/seek, search/no results, Devices/mini-player navigation, queue add/remove/select/empty recovery, action-menu Escape/focus, shuffle/repeat, notch-switch state, and reduced motion. All three views passed horizontal-overflow checks at 1440×1000, 960×720, 720×560, and 390×844. All embedded covers loaded; there were no JavaScript errors or external runtime requests. Screenshot display in the review tool remained blank, so a human visual review of the HTML is still needed; the checks do not establish pixel-reviewed quality or native app behavior.

### Native SwiftUI passes

Finish each pass across the scoped screens before beginning the next. First make the main workspace coherent, then apply the same decisions to companion and entry screens. Do not use the pass as a reason to restructure networking or state ownership.

| Pass | Work and target values | Primary files |
| --- | --- | --- |
| 1. Spacing | Use 4, 8, 12, 16, 20, 24, 32; page edges 24/32, sidebar padding 16, panels 20/24. Navigation 36-point rows with 4-point gaps; align icons, labels, queue actions, and time columns. Keep native title-bar clearance and notch camera dimensions as measured geometry exceptions | `RoomWorkspaceView.swift`, `RoomComponents.swift`, `EntryLayout.swift`, `NotchIslandView.swift` |
| 2. Color | Keep studio/gallery/gold roles; define background, panel, raised, primary, secondary, muted, separator, accent, and semantic states. Quiet neutral separators; gold only for primary/selected roles. Verify 4.5:1 normal-text contrast in both appearances. Keep album art colors and the original logo assets | `NativeTheme.swift`, shared buttons/status views |
| 3. Icons | Keep the project's SF Symbols. Standardize 16/18-point interface symbols, regular stroke, 20-point alignment boxes and 8-point label gaps. Filled playback symbols remain recognizable. Make the interactive area at least 32 points; use 44 points for primary transport actions where space permits | `RoomComponents.swift`, room navigation/menus, account and notch controls |
| 4. Copy | Remove tracked overlines, redundant room slogans, and trailing periods from short labels. Keep clear search instructions and recovery/error text. Preserve the real controller-only explanation and explicit device readiness states; do not claim native audio, offline playback, or measured sync quality | `RoomWorkspaceView.swift`, introduction/authentication views, `NotchIslandView.swift` |
| 5. Type | Retain system sans for UI, the existing serif role in gallery headings, and system mono for room code/time. Use 12/13 metadata, 14 body/rows, 16 section labels, 24/28 headings; weights 400/500 with 600 only for rare emphasis. Use monospaced digits and a single duration format | `NativeTheme.swift` and scoped views |
| 6. Layout | Preserve Listening room → Find music → Devices and the existing two appearance compositions. Review a 240-point rail at roomy widths and a compact rail at smaller widths against usable content space. Keep track title, transport, and queue visible; retain the existing narrow navigation and sticky-player behavior. Tune breakpoints from real window checks | `RoomWorkspaceView.swift`, `EntryLayout.swift`; app window defaults only if checks justify it |
| 7. Details | Controls 8-point radius, panels 12/16, inner radius derived from outer minus inset. Keep the circular play control as a deliberate exception. Distinguish selected/current/hovered/focused/disabled queue rows; expose keyboard focus for plain/custom buttons. Use neutral counts, readable connection states, and truthful unavailable-duration presentation | `RoomComponents.swift`, `RoomWorkspaceView.swift`, `NativeTheme.swift` |
| 8. Visuals | Keep real album art as the main rich element and the existing record fallback. Verify image crops, long titles, missing art, loading/failure states, and queue artwork consistency. Avoid decorative waveforms or fake timing indicators that imply real measurement. Do not add a marketing hero or generated scene | `RoomArtwork`, player/queue views, notch track identity |
| 9. Motion | Use one non-bouncy feedback curve: roughly 120 ms for hover/press and 180–220 ms for presentation. Animate only meaningful state changes. Respect reduced motion; no new looping or layout animation. Tune notch motion separately only after observing it; preserve its native window/camera coordination | Scoped SwiftUI transitions, `NotchMotion.swift`, `NotchWindowController.swift` |

## Boundaries

- Playback commands continue to round-trip through the existing room/session layer. Theme, navigation, focus, and geometry changes must not reconnect sockets, reset the queue, or dispatch playback.
- Preserve `RoomSession`, authentication/API contracts, blocked-player/readiness behavior, track identity, permanent-room behavior, and notch lifecycle. Fix presentation through existing state; record any stale-timeline or transport defect separately if it requires model/backend changes.
- This pass does not implement AVAudioEngine, Apple Music playback, LAN/BLE pairing, routing, Electron, or iOS/Windows redesign. Those remain in the native rebuild plan.
- Keep the current file structure and preserved app artwork. Inspect usages before introducing shared tokens or removing view helpers. No blanket source reset or rebrand.

## Validation and acceptance

1. Before edits, obtain a usable baseline capture of the main room and note default, minimum, and wide-window behavior. If screenshot capture remains blank, inspect the visible app directly and document that before/after screenshot evidence is unavailable; do not claim pixel-verified results. Keep the main design review to at most three meaningful rendered comparisons, excluding interaction-only checks.
2. Discover the current Xcode scheme/settings and build the macOS target after the UI changes. Preserve deployment target, signing, dependencies, and iOS configuration. A documentation-only planning change does not require an app build.
3. Review dark/light appearances at 720×560 minimum, 960×720 default, and approximately 1440×900 roomy sizes. Verify title-bar clearance, sidebar density, scrolling, queue height, sticky transport, long track/account names, and no clipped controls.
4. Exercise empty/current-track queues, pending/failed search, reconnecting/disconnected states, device readiness, missing artwork, copy-code feedback, disabled transport, seek availability, shuffle/repeat, and queue menus with existing local development data. If no valid duration exists, show it as unavailable and disable seeking; do not invent track length or latency.
5. Verify keyboard navigation, visible focus, shortcuts, VoiceOver labels/selected states, text/icon contrast, reduced motion, and light/dark switching without room-state mutation. Review both the main window and compact/expanded/pinned notch companion on notched/non-notched displays where available; record unavailable hardware checks.
6. Smoke-check room control with the existing local backend and a browser player: theme/navigation changes preserve session/queue, and play/pause/seek still affect the shared room through server state. Do not claim synchronized native audio from this controller-only client.
7. No tests that mirror view markup. Run any existing relevant checks; add behavior tests only if implementation changes nontrivial interaction/state logic. Report build/runtime results and any checks not exercised.
8. Revisit every audit row and record fixed, intentionally retained, or deferred with a reason. Deliver concise before/after notes, file changes, and remaining limitations.

## Native implementation report — 2026-11-16

The user's continuation after the HTML prototype authorized carrying this direction into the native app. The studio/gallery appearances, Linked Play mark, room navigation, and session behavior are preserved.

| Pass | Applied native change |
| --- | --- |
| Spacing | Room padding/gaps follow 4-point steps, roomy sidebar is 240 points, queue artwork is 44 points, transport sizes are 40/56 points, and custom controls have consistent hit areas |
| Color | Shared tokens now match the HTML's charcoal/ivory/bronze ramp; separators are neutral at 9–10% opacity; primary buttons use a solid accent rather than metallic gradients |
| Icons | Native SF Symbols remain; navigation/transport symbols use consistent 16/18-point roles and aligned boxes; physical notch geometry keeps its measured exceptions |
| Copy | Room/account/launch labels use sentence case and direct context; redundant slogans/greeting headlines are simplified; introduction copy identifies Apple Music and nearby/offline support as planned |
| Type | Functional room metadata is at least 12 points, navigation is 14, counts/times use plain tabular figures, and small labels no longer use wide tracking |
| Layout | Existing narrow navigation/sticky transport remain; wide windows use the 240-point source rail and 320/352-point queue; account and introduction resize algorithms remain intact |
| Details | Shared native hover/press feedback respects disabled/reduced-motion states; queue selection uses a neutral surface; control radii are consistent; unknown durations show unavailable times and retain disabled seeking |
| Visuals | Existing album images, record fallback, logo/assets, and product illustrations remain; album corners are 4 points; decorative launch/introduction radial washes are removed |
| Motion | Shared controls use 120 ms non-bouncy feedback, launch entrances are shorter, notch expansion uses critical damping, and its redundant blur layer is removed while camera/window coordination remains intact |

Changed source is limited to the palette/shared button styles, room workspace/components, introduction/launch, account views, and notch presentation/motion. Compared against the saved pre-polish source baseline, authentication/API implementations, `AppModel`, `RoomSession`, room models, notch window lifecycle, hardware geometry, and island shape are unchanged. No app assets, deployment/signing settings, backend code, or web files were changed by this polish pass.

Validation:

- `xcodebuild -project 'Syncbeats(apple)/Syncbeats/Syncbeats.xcodeproj' -scheme Syncbeats -configuration Debug -destination 'platform=macOS' -derivedDataPath /tmp/syncbeats-macos-ui-build build` passed
- Existing `verification/run-room-checks.py` passed all 30 room/notch checks, including authoritative queue/timeline state and camera-safe expansion
- Existing `verification/render-native-layouts.py` generated compact/default/large dark/light room, introduction, account, and notch captures under `/tmp/syncbeats-native-layouts`; OCR confirmed visible room controls/time labels, login/signup actions, and the full introduction detail copy plus Next action in the compact captures
- The built app launched and its dark/light selection changed correctly, then returned to dark; stored-session restoration reached the existing connection failure state because the Debug API at `localhost:4000` is unavailable
- `git diff --check` passed; no tests mirroring view markup were added

Remaining review limits: screenshot display in the tool is blank, so captures and OCR do not establish a full visual inspection. Interactive room playback/search/queue smoke checks against a live local backend, VoiceOver/keyboard focus inspection, high-contrast review, and physical notched/non-notched hardware checks remain unverified. Native audio/music/LAN work remains in the rebuild plan. These limits do not change the scope or behavior of this UI patch.

The original HTML prototype remains available for direction review. The native build is at `/tmp/syncbeats-macos-ui-build/Build/Products/Debug/Syncbeats.app`.

Method: [unslop](https://heydamir.design/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0. Local source: `/Users/abhinay/Library/Application Support/orca/codex-accounts/a94f8775-39c3-41af-88f5-a115b3ecf280/home/skills/unslop/SKILL.md`. This plan adapts the skill to native SwiftUI and the repository's already selected appearance.


## Compact window and notch follow-up

Implemented on `macos-dev`:

- The listening workspace uses a fixed, non-scrolling player below 1184 points wide or 660 points high, measured inside the app chrome. Both sidebars are absent at these sizes, with no controls to reopen them. Larger windows retain the full navigation and queue.
- Room code, playback controls, progress and connected devices fit the minimum 720 × 560 app window. Device chips omit owner prefixes and abbreviate long names; full names and readiness remain in help and accessibility labels. Overflow uses a count.
- Find music opens in a separate sheet, keeping the player fixed.
- The brand mark aligns with the 24-point content margin below the system title bar, and its square canvas centers within its parent.
- The notch tracks pointer movement across the physical panel bounds, including the camera gap, rather than relying only on SwiftUI hover rectangles. The whole compact cap, including the visible lip below the camera, opens/closes it through an AppKit mouse handler and a SwiftUI accessibility button. Pinning, unpinning outside the overlay, Escape, and open-room dismissal are preserved.
- An interruptible opening spring uses a small bounded overshoot; closing is faster and critically damped. One display link drives the AppKit panel and SwiftUI silhouette together. Reduced motion still reaches the target immediately. Reference: [NotchNook](https://lo.cafe/notchnook); independent implementation.

Verification: Debug macOS build passed, 37 room/layout/motion checks passed, and 9 checks against the real AppKit notch panel passed (open, close, reversal, frame size, dismissal, hide, reopen). Native fixtures rendered at 720 × 560 in both themes, 960 × 720, 1183 × 660, 1184 × 720, and wide/short sizes. Compact accessibility output contains the player controls and no scrolling/sidebar container. Image inspection in this session was limited by image-display failure; native OCR and accessibility checks verified content placement. Direct camera-area pointer testing through GUI automation was blocked by `noWindowsAvailable`; the real panel animation checks passed, but hardware hover remains unverified.

Artifacts: `/tmp/syncbeats-native-layouts`; app: `/tmp/syncbeats-macos-ui-build/Build/Products/Debug/Syncbeats.app`.


## Click-to-open notch correction

The resting camera island now extends 10 points below the physical camera safe area. Artwork and the music indicator stay in the side wings, but the entire cap is clickable, including the center lip. AppKit captures the cap's mouse-down/mouse-up sequence directly so opening does not depend on SwiftUI hit-testing the camera gap. The first click opens and pins the player; a second click closes it. Hover no longer opens the full player, and leaving the pointer does not immediately close a clicked-open player.

Validation: the Debug macOS build passed, 37 room/motion checks passed, and 10 real-panel checks passed. The panel verification dispatches mouse-down and mouse-up events into the center lip, verifying opening, closing on the next click, frame dimensions, interrupted motion, dismissal, hide and reopen. Direct live GUI testing still encountered `cgWindowNotFound` because the main app window was not on the active desktop; panel event verification used the actual AppKit window with local fixtures.


## Live expansion failure: panel level reset

The live overlay was at window-server layer 3 even though the code assigned status-bar level 26. `NSPanel.isFloatingPanel = true` was called after the level assignment and reset it to the normal floating level, allowing the menu bar to sit above the cap and intercept clicks. The status-bar level is now assigned after floating-panel configuration, and mouse-event acceptance is explicit.

The added native regression check failed against the old setup and passed after the assignment was moved. Debug build and all 11 real-panel checks passed. After relaunching the corrected app, the live window-server metadata reported the island at layer 26 with an expanded 480 × 308 frame (compact frame: 332 × 48 on this screen). This confirms expansion in the running app, beyond the earlier synthetic click tests.


## Automatic dismissal

Click-to-open remains, but opening no longer pins the island. The pointer leaving the expanded panel starts a 240 ms close delay; re-entering cancels the pending close. Key-window focus loss, app deactivation, another foreground app becoming active, and an outside mouse click also dismiss it. The pin action is replaced by a close button. The single display-link closing animation and the corrected status-bar window level are retained. Focus/pointer observers are removed when the island is hidden.

Debug macOS build and all 16 native panel checks passed. New checks cover hover exit, cancellation on re-entry, key-focus loss, app deactivation, and foreground-app changes for the nonactivating panel. The latest app was relaunched; the live island is visible at its compact 332 × 48 frame on this screen. GUI control could not attach to the main window on its inactive desktop, so automatic dismissal was verified with the real native fixture panel.
