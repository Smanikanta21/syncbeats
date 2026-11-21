# Native playback and album ambient player

Implemented on `macos-dev`, 2026-11-19.

The Mac now downloads audio in bulk, decodes it with AVAudioFile, and schedules AVAudioPlayerNode segments through AVAudioEngine. Duration comes from sample count. The player uses that duration when older queue items have no metadata. Native YouTube enqueue requests include validated duration metadata; the backend also records duration when resolving an untitled video.

Playback follows authoritative room snapshots. Native clock probes use monotonic round-trip timing. Scheduling uses the server's start epoch and pause offset; drift corrections fade around sample repositioning without changing pitch. Ready messages carry `isReady` and the track URL only after decoding succeeds. Reconnect re-declares readiness. Leave and network disconnect stop rendering. Ended notifications include playback instance identity.

The expanded player's full-screen button opens a native window sharing RoomSession. Escape or Close returns to the room. The background clusters cover colors in sRGB, softens saturation, and blends large blurred shapes under a contrast veil. Motion uses smoothed rendered loudness, bass energy, and transients from the mixer tap. It has no artificial BPM pulse. Pause clears energy; Reduced Motion keeps the composition still. This is audio-reactive motion, not a verified beat-grid detector.

## Verification

- Debug macOS build passed.
- Native audio and real Room + Socket.IO integration: 33 checks passed. Covers duration, scheduled start, pause/resume, seek, malformed audio, HTTP failure, readiness, clock probes, reconnect, and disconnect.
- Room regressions: 47 checks passed. Native notch regressions: 16 checks passed.
- Backend typecheck and RoomQueue/RoomPlayback/RoomPersistence checks passed.
- Full-screen renders generated at 720×560, 960×720, 1512×982, and 2560×1440. Screenshot text recognition confirmed title, artist, elapsed/total duration, and pause status within compact bounds. Image-viewing tools returned blank images, so subjective visual quality was not directly verified.
- Initial visible app tools returned `accessibility_error` / `cgWindowNotFound`. Audio fixtures used real AVAudioEngine with a quiet synthetic WAV and production Room state through local Socket.IO. Live app checks subsequently succeeded as described below.

## Live duration and playback fix

Live macOS verification on 2026-11-19 found that `RoomProgress` still read queue `durationSec`, so older items without metadata showed `—:—` and disabled seeking even after their audio loaded. The progress control, queue durations, and remaining-time display now use the decoded duration from `RoomSession`. The obsolete controller-only footer now reports audio loading, ready, or failure with Retry.

Rebuilt and relaunched the app from the user's active Xcode DerivedData product. The existing F1 track downloaded from the local backend's AAC cache (3,133,476 bytes) and decoded to 193.657528 seconds at 44.1 kHz, stereo. Live accessibility checks confirmed `3:13` in the dock, expanded player, queue, and full-screen player. Seeking to 120 seconds displayed `2:00`; Play started AVAudioEngine rendering and advanced the position; Pause stopped rendering. Restored the original paused position at 91.092 seconds. The rebuilt product passed all 47 room/notch regression checks.

This live check used an already cached YouTube file. Fresh upstream extraction, cloud playback, subjective speaker output, and cross-device audible timing remain unverified.

## Local reproduction

Build first, then run these in separate terminals. The audio check plays a quiet synthetic tone.

```sh
postman simulation run 'Syncbeats(apple)/verification/postman/simulations/native-audio.sim.yaml' --port 4189 --no-history
node 'Syncbeats(apple)/verification/native-playback-room.cjs'
SYNCBEATS_PLAYBACK_TEST_URL=http://127.0.0.1:4190 python3 'Syncbeats(apple)/verification/run-native-audio-checks.py'
```

Fixtures make no upstream calls and do not alter stored rooms. The simulation models valid audio, 503, and malformed audio; unmodeled calls return 501.

## Ambient and audio-thread fix, 2026-11-19

The ambient layer previously existed only in the separate full-screen player. The expanded room player now uses the same artwork resolver and palette as the cover and full-screen player. Soft curved shapes change contour, drift across the background, and expand with bass/loudness; transient response is bounded. Quiet music receives adaptive gain, stereo loudness survives phase cancellation, and silence produces no false beat. Pause freezes the flow, while Reduced Motion keeps a static background. Light appearance uses a lighter foreground-protection overlay.

Core Audio graph creation, decoding, schedule, stop/reset, volume, and render-time queries now run on a serial user-initiated worker. The UI reads a small cached position snapshot instead of calling `playerTime` directly, preserving host-time scheduling and the adaptive crossfade correction. This addresses the reported UI-thread priority inversion sites; absence of Xcode runtime warnings still needs confirmation in a fresh diagnostic session.

Validation: Debug build passed; 38 audio checks and 47 room/notch checks passed. Native rendered-pixel checks confirmed time-driven movement (mean channel delta 2.77), audio response (1.49), and a still paused background. Dark/light layouts render at compact and wide sizes. Screenshot forwarding still returns blank images, so subjective appearance is not claimed as visually reviewed.

Rebuilt and relaunched the active Xcode app, then played the existing F1 track. Live diagnostics confirmed rendering with ambient loudness 0.90, bass 0.85, and transient 0.31, and accessible expanded/full-screen controls remained functional. Paused and restored the prior 101.942-second position. Audio fixtures were stopped after verification.

## Remaining limits

Download-first supports YouTube through the existing AAC/M4A route and direct HTTP audio. P2P and protected MusicKit need separate adapters. Output uses the system default. Bluetooth/output latency calibration, route recovery, prefetching, disk caching, and cross-device audible-skew measurements are follow-up work. These checks do not establish the 25 ms audible-sync target. Rebuild/relaunch the app to use this implementation; backend duration/format changes need deployment for cloud clients.
