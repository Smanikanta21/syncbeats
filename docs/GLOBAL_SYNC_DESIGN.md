# Global playback synchronization design

## Goal and limits

SyncBeats synchronizes the start and position of separate audio outputs. The
network server coordinates room intent; each browser estimates its own clock
offset and schedules audio through Web Audio. The server is not in the audio
render loop, so a low-resource VM can serve many small control messages without
processing audio.

The current US-hosted server cannot mathematically guarantee that devices in
China, India, and other regions will be within 25 ms of one another. A clock
probe measures round-trip delay, but it cannot determine which direction carried
more delay. A nearby regional time/control edge or a same-LAN coordinator can
reduce that uncertainty. A peer-to-peer media path alone does not solve clock
alignment.

## Clock measurement

Each probe uses four timestamps in milliseconds:

- `t0`: client wall time immediately before send.
- `t1`: server receive time.
- `t2`: server send time.
- `t3`: client receive time, reconstructed as `t0 + (performance.now() - perf0)`.

The offset convention is **server time minus client time**:

```text
offset = ((t1 - t0) + (t2 - t3)) / 2
network RTT = (t3 - t0) - (t2 - t1)
```

Using `performance.now()` for client elapsed time prevents a wall-clock/NTP
adjustment during a probe from contaminating the measurement. Removing server
processing time makes the RTT estimate a better network sample. The estimator
still assumes roughly symmetric one-way paths; no four-timestamp exchange can
identify path asymmetry from a single endpoint.

The client rejects negative or over-tier RTT samples, fences RTT outliers,
selects the low-delay subset, and takes the median offset. It blends later
estimates to avoid jitter-driven jumps. Each client maintains its own estimate;
the server only echoes the timestamps and shares room playback epochs.

## What path asymmetry means numerically

For equal client/server clocks and a 160 ms client-to-server path plus an 80 ms
return path:

```text
t0=0, t1=160, t2=160, t3=240
RTT = 240 ms
estimated offset = 40 ms (bias = half the 80 ms path difference)
```

The client cannot infer that 40 ms bias from this exchange alone. A conservative
bound for one client's offset error is half its RTT; for two independently
estimated clients the relative error bound is approximately half the sum of
their RTTs. That bound is intentionally conservative, but it shows why a
long-distance single-region server cannot promise a global 25 ms acoustic
limit. Actual acoustic error also includes output-device latency and its
calibration error.

## Current implementation policy

1. Keep room state and playback epochs authoritative on the server.
2. Use seven initial/periodic samples on a good link, five on fair, and four on
   a poor link;
   resync every 10–20 seconds instead of repeatedly sending large bursts.
3. Run drift checks at an adaptive 250–1000 ms cadence while visible. Suspend
   frequent checks in the background and correct on return to the foreground.
4. Keep playback rate exactly `1.0`. Leave errors inside the network tier's
   hard-seek threshold alone; correct larger ordinary errors with a brief gain
   crossfade and seek, and reserve an immediate snap for an unusually large
   error.
5. Schedule a live playback event immediately when a valid offset is already
   available. Refresh the offset in the background rather than making a new
   ping burst delay an event with a short future `atEpoch`.
6. Keep output latency compensation in the render-position comparison. It is a
   device-side concern and must not be confused with network clock offset.
7. Spatial-audio playback and the `spatial:update` socket mutation are disabled
   while the feature is labeled Beta / Coming soon; the dormant room model is
   retained so the feature can return behind a deliberate re-enable.

This policy reduces periodic browser wakeups and probe traffic. If there are
`N` active devices, four to five pings per 10–20 second interval produce about
`0.2–0.7 × N` ping requests per second on average, instead of roughly
`3–4 × N` in the old fastest tier (20 samples around every 4 seconds). Slower
old tiers already probed less often. These are probe counts, not measured VM
capacity or battery benchmarks.

## Architecture choices

### Now: one server clock and room authority

Keep this as the reliable default. The VM handles room membership, queue state,
and small clock/playback packets; media bytes remain on the existing delivery
paths. Regional RTT is the limiting factor, not server CPU. Do not add a
continuous server-side correction loop.

### Next: region-near control/time edges

When global measurements justify the operational cost, add a small set of
regional control/time edges. They must use disciplined clocks (for example,
host-level NTP/chrony) and carry a clear uncertainty estimate. Rooms still need
one authoritative playback timeline; choose an edge for clock probes and route
the room's control traffic consistently. Cross-region room participants need a
documented fallback to the authoritative room epoch. Edge selection and
failover must not silently reset a room's clock origin.

### Local case: same-LAN leader or relay

For co-located devices, a local relay/leader can exchange four-timestamp probes
over the LAN and distribute the room epoch with much lower RTT. Keep the cloud
server as identity/room authority and reconcile local state to it. A leader
change must hand off the epoch and clock mapping, not restart playback.

### P2P media is a separate decision

Peer-to-peer transfer can reduce media-server egress or fetch delay when devices
already share a room, but it does not provide a trusted shared clock by itself.
Keep clock/control and media delivery as separate layers. Measure a local relay
first; introduce a mesh only if bandwidth, NAT traversal, source availability,
and battery measurements justify its extra connections and recovery paths.

## Validation required before setting an SLA

Do not describe the 25 ms target as a measured global guarantee until acoustic
output has been measured. Validate with at least three simultaneous clients,
including phone and desktop output paths, in the foreground and background.
Record server region, each client's probe RTT distribution, output latency,
room start lead, schedule arrival time, and acoustic onset/phase error. Run
separate same-LAN, India-to-US, China-to-US, and mixed-region trials; report
median, p95, and worst observed inter-device error. Repeat while the low-end VM
is under representative control/API load and compare mobile energy use before
and after the lower-frequency polling change.

Unit tests for the timestamp arithmetic establish the sign convention and the
known asymmetry bias. They do not establish real audio synchronization,
geographic performance, or battery savings.
