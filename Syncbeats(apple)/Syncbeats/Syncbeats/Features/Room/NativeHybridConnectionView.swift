import SwiftUI

struct NativeHybridConnectionView: View {
    let room: RoomSession
    let palette: NativePalette
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(room.hybrid.connectionLabel, systemImage: room.hybrid.peers.contains(where: \.usable) ? "wifi" : "network")
                .font(.system(size: 13, weight: .medium))
            Toggle(isOn: Binding(get: { room.hybrid.proximity.enabled }, set: { room.hybrid.proximity.enabled = $0 })) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Nearby hints").font(.system(size: 13))
                    Text("Use Bluetooth to spot nearby room devices.")
                        .font(.system(size: 11)).foregroundStyle(palette.secondary)
                }
            }.toggleStyle(.switch).tint(palette.gold)
            if room.hybrid.proximity.enabled {
                Text(room.hybrid.proximity.availability).font(.system(size: 11)).foregroundStyle(palette.secondary)
            }
        }
        .padding(16).background(palette.text.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct RoomDeviceConnectionStatus: View {
    let participantID: String
    let room: RoomSession
    let palette: NativePalette

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            if room.canControl, room.hybrid.peers.contains(where: { $0.id == participantID && $0.usable }) {
                HStack(spacing: 4) {
                    Text("Nearby")
                        .fontWeight(.semibold)
                        .foregroundStyle(palette.gold)
                        .shadow(color: palette.gold.opacity(0.75), radius: 4)
                    Text("· Hybrid")
                        .foregroundStyle(palette.secondary)
                }
                .font(.caption2)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Nearby, hybrid connection active")
            } else if let hint = room.hybrid.proximity.hint(for: participantID) {
                Text(hint)
                    .font(.caption2)
                    .foregroundStyle(palette.gold)
            }
        }
    }
}
