# Foreground playback desync — 22 November 2026

The reported failure affects continuously playing devices with both room screens awake, across browser and native combinations. The previous background-tab fix does not establish a resolution of this symptom.

## Current evidence

- The actual React room and Web Audio hooks correct a forced 200 ms position error with trusted clock/readiness/unlock gates, without pause/resume. Browser checks use a WAV fixture and simulated server events, not physical speakers or real production playback.
- Graph render time can agree with estimated latency while device output time remains behind. A regression with a 40 ms estimated latency and 140 ms measured output delay previously appeared synced; the output-clock correction converges without playback commands.
- Production's configured telemetry database returned no recent samples. Saved account latency values inspected were zero or absent; no nonzero saved setting was established as the cause.

## Web patch

Use `AudioContext.getOutputTimestamp()` to relate device output time to graph render time. Correct the graph against that measured delay, with the existing latency estimate as fallback for missing, stale, invalid or pre-start timestamps. Keep playback rate at 1 and adaptive thresholds unchanged. Reject nonfinite manual offsets.

Send a compact `sync:diagnostic` report every ten seconds during room playback; the server logs at most once per socket every thirty seconds. Reports include correction gate, clock offset, expected/render/output positions, measured/estimated/manual latency and correction tier. Only current room members can report, and payload fields are sanitized. Tokens, track names, account IDs and user agents are omitted.

## Native findings — source audit, not changed by this web patch

`Syncbeats(apple)/Syncbeats/Syncbeats/Services/AudioEngine.swift` schedules with `(now - startEpoch) + pauseOffset + latencyOffsetMs`. The web/backend contract already includes the resumed position in `startEpoch`; adding `pauseOffset` again double counts it. Correct late position should be `(serverNow - startEpoch) / 1000`, with future start gated at `startEpoch + pauseOffset * 1000`.

`RoomManager.startPositionTimer()` updates UI position from the room clock every 0.25 seconds. No continuing comparison with `AVAudioPlayerNode.playerTime(forNodeTime:)` was found in this checkout. A moving progress display is not evidence of synchronized native audio.

Native implementation needs: track the scheduled segment frame and host-time start per playback instance; derive rendered media position from the player node; compare with the trusted room clock and device output latency; correct with a guarded fade/reschedule; preserve readiness on reconnect; cancel corrections on pause/replacement/end. Validate a signed native build against a web client before claiming cross-platform convergence. Native edits are outside this branch's web working scope.

## Production follow-up

Merge the web commit into `main` to deploy it. In the same room, keep both screens visible and collect `[SyncDiagnostic]` lines while initially playing, then across pause/resume. Interpret `clock-untrusted`, `audio-not-ready`, `track-mismatch`, and `position-unavailable` as gates; compare `active` signed drift and output delay across sockets. Physical audible phone/laptop and native/web verification remains outstanding. Do not widen thresholds to hide the report.
