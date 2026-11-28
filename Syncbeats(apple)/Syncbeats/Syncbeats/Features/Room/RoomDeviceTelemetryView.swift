import SwiftUI

struct RoomDeviceTelemetryView: View {
    let participant: RoomParticipant
    let room: RoomSession
    let palette: NativePalette

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let data = room.deviceTelemetry(for: participant.id)
            VStack(alignment: .leading, spacing: 7) {
                Text(data.path ?? "Network measurements unavailable")
                    .font(.caption2).foregroundStyle(palette.secondary)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), alignment: .leading)], alignment: .leading, spacing: 8) {
                    metric(data.legacyNetwork == nil ? "Latency (est.)" : "Latency (reported)", value: milliseconds(data.latency))
                    metric("RTT", value: milliseconds(data.network?.rttMS))
                    metric("Jitter", value: milliseconds(data.jitter))
                    metric("Sync (est.)", value: alignment(data.playbackError))
                }
            }
        }
    }

    private func metric(_ label: String, value: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption2).foregroundStyle(palette.secondary)
            Text(value ?? "—").font(.caption).monospacedDigit().foregroundStyle(palette.text)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(label))
        .accessibilityValue(Text(value ?? "Unavailable"))
    }

    private func milliseconds(_ value: Double?) -> String? {
        value.map { "\($0.formatted(.number.precision(.fractionLength(1)))) ms" }
    }

    private func alignment(_ value: Double?) -> String? {
        guard let value else { return nil }
        if abs(value) < 1 { return "Within 1 ms" }
        let amount = abs(value).formatted(.number.precision(.fractionLength(0)))
        return value > 0 ? "\(amount) ms ahead" : "\(amount) ms behind"
    }
}
