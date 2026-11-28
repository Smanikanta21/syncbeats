import Foundation

nonisolated struct NativeNetworkMetrics: Codable, Sendable {
    let rttMS: Double
    let jitterMS: Double?

    var valid: Bool {
        (0...5_000).contains(rttMS) && (jitterMS.map { (0...5_000).contains($0) } ?? true)
    }
}

/// Median RTT and median change between consecutive round trips. A bounded window
/// keeps single spikes from dominating, while sustained changes replace older samples.
nonisolated struct NativeNetworkSamples {
    private var samples: [(uptime: TimeInterval, rtt: Double)] = []
    var lastUptime: TimeInterval? { samples.last?.uptime }

    mutating func record(_ rtt: Double, at uptime: TimeInterval) {
        guard (0...5_000).contains(rtt), uptime.isFinite,
              samples.last.map({ $0.uptime <= uptime }) ?? true else { return }
        samples = Array(samples.filter { uptime - $0.uptime <= 45 }.suffix(8))
        samples.append((uptime, rtt))
    }

    func metrics(at uptime: TimeInterval, maxAge: TimeInterval) -> NativeNetworkMetrics? {
        guard let latest = samples.last, (0...maxAge).contains(uptime - latest.uptime) else { return nil }
        let values = samples.filter { uptime - $0.uptime <= 45 }.map(\.rtt)
        let changes = zip(values, values.dropFirst()).map { abs($0.0 - $0.1) }
        return NativeNetworkMetrics(rttMS: Self.median(values) ?? latest.rtt, jitterMS: Self.median(changes))
    }

    static func median(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        let sorted = values.sorted()
        return (sorted[(sorted.count - 1) / 2] + sorted[sorted.count / 2]) / 2
    }
}

nonisolated struct NativePlaybackAlignment: Codable, Sendable {
    let epoch: Double
    let errorMS: Double

    var valid: Bool { (0...1e14).contains(epoch) && abs(errorMS) <= 120_000 }
}

nonisolated struct NativeParticipantTelemetry: Decodable {
    let network: NativeNetworkMetrics
    let playback: NativePlaybackAlignment?
}

nonisolated struct LegacyParticipantTelemetry: Decodable {
    let latency: Double
    let jitter: Double

    var valid: Bool { (0...5_000).contains(latency) && (0...5_000).contains(jitter) }
}

nonisolated enum ParticipantTelemetryReport {
    case measured(NativeParticipantTelemetry)
    case legacy(LegacyParticipantTelemetry)
}

nonisolated struct RoomDeviceTelemetry {
    var path: String?
    var network: NativeNetworkMetrics?
    var legacyNetwork: LegacyParticipantTelemetry?
    var playbackError: Double?

    var latency: Double? { network.map { $0.rttMS / 2 } ?? legacyNetwork?.latency }
    var jitter: Double? { network?.jitterMS ?? legacyNetwork?.jitter }
}

nonisolated struct NativeClockStamp {
    let wallMS: Double
    let uptime: TimeInterval

    static func now() -> Self {
        Self(wallMS: Date().timeIntervalSince1970 * 1000, uptime: ProcessInfo.processInfo.systemUptime)
    }

    func isFresh(at now: Self, maxAge: TimeInterval) -> Bool {
        let age = now.uptime - uptime
        return (0...maxAge).contains(age) && abs(now.wallMS - wallMS - age * 1000) < 20
    }
}
