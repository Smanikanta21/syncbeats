import Foundation
import Combine

/// NTP-style clock offset against the server, so playback position can be derived
/// from the room's `startEpoch` (which is in *server* time).
///
/// Mirrors the estimator in the web client (`hooks/useRoom.ts`):
/// `offset = t1 - (t0 + t3) / 2`, RTT-gated, median of the best-RTT half of the burst.
///
/// This is the *measurement* half of sync only. Drift correction and sample-accurate
/// scheduling belong to the AVAudioEngine work, which does not exist yet.
@MainActor
final class SyncClock: ObservableObject {
    @Published private(set) var offsetMs: Double = 0
    @Published private(set) var rttMs: Double = 0
    @Published private(set) var sampleCount: Int = 0

    /// Fresh samples above this RTT are thrown away — a 1s round trip tells you
    /// nothing useful about the offset.
    private let rttGateMs: Double = 1000
    private let window = 20

    private var inFlight: [Int: Double] = [:]
    private var samples: [(offset: Double, rtt: Double)] = []
    private var seq = 0

    var isSynced: Bool { sampleCount >= 3 }

    /// Server clock estimate, ms since epoch.
    var serverNow: Double { Self.nowMs() + offsetMs }

    nonisolated static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

    /// Stamp and remember an outgoing `sync:ping`.
    func nextPing() -> (t0: Double, seq: Int) {
        seq += 1
        let t0 = Self.nowMs()
        inFlight[seq] = t0
        // A pong that never arrives would leak an entry; bound it.
        if inFlight.count > 64, let oldest = inFlight.keys.min() { inFlight.removeValue(forKey: oldest) }
        return (t0, seq)
    }

    /// Fold a `sync:pong` into the estimate. `t1` is the server's clock at receipt.
    /// `t3` must be stamped the instant the pong lands — pass it in explicitly so an
    /// actor hop between the socket callback and here doesn't inflate the RTT.
    func accept(seq pongSeq: Int, t1: Double, t3: Double = SyncClock.nowMs()) {
        guard let t0 = inFlight.removeValue(forKey: pongSeq) else { return }
        let rtt = t3 - t0
        guard rtt >= 0, rtt < rttGateMs else { return }

        samples.append((offset: t1 - (t0 + t3) / 2, rtt: rtt))
        if samples.count > window { samples.removeFirst(samples.count - window) }
        recompute()
    }

    func reset() {
        inFlight.removeAll()
        samples.removeAll()
        offsetMs = 0
        rttMs = 0
        sampleCount = 0
    }

    private func recompute() {
        guard !samples.isEmpty else { return }
        // Keep the fastest half — strips scheduler stalls and Wi-Fi jitter spikes.
        let best = samples.sorted { $0.rtt < $1.rtt }.prefix(max(1, samples.count / 2))
        let offsets = best.map(\.offset).sorted()
        offsetMs = offsets[offsets.count / 2]
        rttMs = best.map(\.rtt).reduce(0, +) / Double(best.count)
        sampleCount = samples.count
    }
}

#if DEBUG
extension SyncClock {
    /// One runnable check for the only non-trivial logic here: the RTT gate and the
    /// median-of-fastest-half. Called from SyncbeatsApp.init in debug builds.
    static func selfCheck() {
        let clock = SyncClock()

        // Server clock is 500ms ahead; symmetric 100ms round trip.
        // offset = t1 - (t0 + t3)/2 = (t0 + 550) - (t0 + 50) = 500
        for _ in 0..<5 {
            let (t0, s) = clock.nextPing()
            clock.accept(seq: s, t1: t0 + 50 + 500, t3: t0 + 100)
        }
        assert(clock.offsetMs == 500, "expected 500ms offset, got \(clock.offsetMs)")
        assert(clock.rttMs == 100, "expected 100ms rtt, got \(clock.rttMs)")
        assert(clock.isSynced, "5 samples should count as synced")

        // A 4s round trip is past the gate and must not move the estimate.
        let (t0, s) = clock.nextPing()
        clock.accept(seq: s, t1: t0 + 9_999, t3: t0 + 4_000)
        assert(clock.offsetMs == 500, "RTT-gated sample leaked into the estimate")

        // An unmatched seq (duplicate or very late pong) is ignored.
        clock.accept(seq: 9_999, t1: 0, t3: 0)
        assert(clock.offsetMs == 500, "unmatched pong changed the estimate")

        // The median must survive a single wild-but-fast outlier.
        let (t0b, sb) = clock.nextPing()
        clock.accept(seq: sb, t1: t0b + 50 + 90_000, t3: t0b + 2)
        assert(clock.offsetMs == 500, "one outlier moved the median, got \(clock.offsetMs)")

        print("[SyncClock] selfCheck ok — offset \(Int(clock.offsetMs))ms, rtt \(Int(clock.rttMs))ms")
    }
}
#endif
