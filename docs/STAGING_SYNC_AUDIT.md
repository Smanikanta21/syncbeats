# Staging synchronization and hosting audit

Checked on 2026-11-20 for `https://dev.syncbeats.in`. The user confirmed built-in speakers on both test devices. Changes in this report are local; the VM configuration, deployed images, and GitHub history were not changed.

## Deployment and measurements

- Google Cloud project `sync-beats-472708`, VM `syncbeats-vm`, zone `us-central1-f` (Iowa).
- `e2-micro`, approximately 1 GiB RAM, 30 GB `pd-standard` disk. Production and staging share this VM, with separate backend and PostgreSQL containers.
- Staging Socket.IO connects to `https://dev-api.syncbeats.in/socket.io`. This was verified in the public frontend bundle and the VM's nginx configuration. `/api/socket.io` on the frontend domain is not the socket endpoint used by the deployed app.
- A 16-ping staging WebSocket probe from the development machine measured 274.6 ms minimum, 275.3 ms median, and 367.3 ms maximum RTT. The estimated offset spread was 51.3 ms; that spread is not a measurement of audible desync.
- Recent two-device staging telemetry reported Mac RTT around 278–279 ms and iPhone RTT around 284–336 ms. Low jitter with high RTT is consistent with a stable connection to a distant region.
- Staging `/api/health` took about 506 ms with redirects followed (three requests). A separate five-request probe on the VM itself measured about 58 ms median health TTFB. These HTTP measurements are separate from WebSocket RTT.
- A prior VM sample showed idle CPU and little active swapping. RAM is limited and swap is allocated, but these samples do not establish sustained CPU overload or current swap thrashing.

## What the saved logs establish

The staging `sync_telemetry` PostgreSQL table contained 73 batches from 41 sessions; 29 batches reported at least two participants. The largest stored drift was 3.18 ms, and all stored correction counts were zero. Production's telemetry table was empty at the time of inspection.

Those numbers do **not** establish millisecond-accurate audible playback. The deployed telemetry subscribed to room-intent notifications and repeatedly sampled the last drift result, rather than receiving each new drift check. Frequent room snapshots also restarted its ten-second flush interval. `audioUnlocked` was inferred from playback intent instead of the audio handle. Existing batches therefore provide useful network information but unreliable playback/correction evidence.

No persistent device-log file or log mount was found. The raw trace POST in the frontend is development-build-only; the staging web frontend is a production build even though its backend sets `NODE_ENV=development`. PostgreSQL telemetry is the available device evidence.

Recent production error lines were mostly 404 responses to automated probes for configuration files. A staging log contained a device-registration uniqueness error on `(user_id, device_key)`; the inspected evidence does not connect it to the audible jitter.

## Local fixes

1. **Clock bootstrap on a distant WAN:** the initial adaptive RTT gate is 250 ms, below every measured staging ping. Previously the first burst could accept no clock samples and postpone playback until a later burst. Bootstrap now uses the fastest valid replies when none fit the gate, with the existing IQR rejection and smoothing retained. Subsequent entirely rejected bursts retain the established offset. Invalid and timed-out replies cannot establish sync. Adaptive thresholds were not widened.
2. **Fresh drift telemetry:** `SyncController` exposes a separate drift-measurement subscription. Metadata changes and paused checks do not create fake drift samples. Correction reports are delivered with their measurements.
3. **Reliable batching context:** snapshot/network-quality updates no longer restart the flush timer. Session age and accumulators reset on a new session; audio unlock is read from the audio handle.

These fixes address verified startup and observability bugs. They do not prove that the user's steady-state audible jitter is resolved, and they have not been deployed.

## Why speakers can still sound out of sync

The player schedules decoded Web Audio buffers against a shared epoch, runs at playback rate 1, and compares the graph's render position against that timeline. It compensates for reported `baseLatency + outputLatency` plus a manual offset. When Safari reports no latency, the current code estimates 45 ms for iOS or 35 ms for Safari on Mac. Those are estimates, not measurements of the user's actual output device. Browser latency reporting and unequal network-path delays can leave audible differences despite matching graph positions, including with built-in speakers as in this test.

After deploying and testing the local changes in staging:

1. Compare two devices using built-in or wired speakers, with both tabs visible. Verify initial play, pause/resume, seek, reconnect, and at least two minutes of steady playback.
2. Use a sharp click/percussion track. Record both speakers together from an approximately equal distance and compare the peaks; sound travel is about 2.9 ms per metre of distance difference.
3. Compare fresh telemetry against that recording. If graph drift is small but one speaker consistently lags, use Settings → Audio Latency Offset on that device to calibrate its output. Bluetooth should be tested separately.
4. If graph drift varies, inspect offset estimates and correction frequency before tuning thresholds. Moving regions can reduce network delay, but cannot directly remove an unknown hardware delay or guarantee a <25 ms audible difference worldwide.

## Hosting within $10/month of general Google Cloud credit

Published USD prices checked on 2026-11-20; estimates use 730 hours/month and exclude taxes and any other resources on the billing account.

| Configuration | VM/month | One public IPv4/month | Fixed subtotal before billable storage and traffic |
| --- | ---: | ---: | ---: |
| Iowa `e2-micro`, within free-tier allowance | $0 | about $3.65 | about $3.65 |
| Mumbai or Delhi `e2-micro` | about $7.34 | about $3.65 | about $10.99 |
| Singapore `e2-micro` | about $7.54 | about $3.65 | about $11.19 |

India's published on-demand `e2-micro` price is $0.010060545/hour. Singapore is $0.010333268/hour. Standard-VM external IPv4 is $0.005/hour, with one hour/month free. The VM free tier applies only in Oregon, Iowa, and South Carolina, up to one equivalent instance-month across eligible regions. It includes 30 GB-month standard persistent disk and 1 GB outbound data/month from North America, excluding China and Australia. Confirm free-tier usage across the billing account before treating the entire allowance as available.

Audio traffic matters more as usage grows: at 128 kbit/s, one listening device downloads roughly 57.6 MB/hour before overhead. Every device fetching a song creates its own transfer. Free compute does not mean unlimited audio delivery. The stored media format and actual bitrate determine real usage.

**Recommendation:** keep Iowa for the current budget, fix and measure playback first, and track actual regional traffic and costs. India makes sense if India becomes the dominant audience and the budget increases; Singapore is an option to benchmark if Asian users dominate. Neither choice benefits every user worldwide. Future room-scoped regional routing or a LAN relay would need a design that preserves one authority per room; adding independent backend replicas alone will not achieve that.

Official pricing sources:

- [Google Cloud free tier](https://cloud.google.com/free/docs/free-cloud-features#compute)
- [General-purpose VM pricing](https://cloud.google.com/products/compute/pricing/general-purpose#e2-shared-core-machine-types)
- [Network and external IP pricing](https://cloud.google.com/vpc/network-pricing)

## Validation

The clock and controller regression checks cover slow-WAN bootstrap, invalid samples, ongoing gate preservation, fresh measured drift, metadata/paused exclusions, correction delivery, audio unlock, and the existing playback-generation protections. The batching regression test covers 25 rapid snapshots, fresh context, correction counts, and reconnect isolation. All 101 frontend tests and TypeScript checks passed in the development workspace. The isolated commit, excluding unrelated work, passed its 60 frontend tests, TypeScript check, and Vercel production build. A physical two-device audible test remains necessary; a passing unit test or the old telemetry cannot replace it.
