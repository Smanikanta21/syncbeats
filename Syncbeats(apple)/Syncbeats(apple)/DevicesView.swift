import SwiftUI

struct SyncDevice: Identifiable {
    let id = UUID()
    let name: String
    let platform: String // "mac", "phone", "tablet", "web"
    let latency: Int // in milliseconds
    let isConnected: Bool
    let statusText: String
    var volume: Double
}

struct DevicesView: View {
    @Environment(\.colorScheme) var scheme
    @State private var syncBeatsMode = false
    @State private var inviteCode = "SB-889A"
    @State private var devices = [
        SyncDevice(name: "This Mac (Host)", platform: "mac", latency: 0, isConnected: true, statusText: "synced", volume: 0.8),
        SyncDevice(name: "Sam's iPhone", platform: "phone", latency: 14, isConnected: true, statusText: "synced", volume: 0.7),
        SyncDevice(name: "Living Room iPad", platform: "tablet", latency: 42, isConnected: true, statusText: "converging", volume: 0.5),
        SyncDevice(name: "Studio Monitors", platform: "web", latency: 120, isConnected: false, statusText: "offline", volume: 0.0)
    ]
    
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {
            
            // SyncBeats Mode Controller Card
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text("⚡")
                            .font(.title3)
                        Text("SyncBeats Mode")
                            .font(Theme.Fonts.headline(size: 18))
                            .foregroundColor(scheme == .dark ? .white : .black)
                    }
                    
                    Text("Broadcast and sync audio latency dynamically across multiple devices.")
                        .font(Theme.Fonts.body(size: 12))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }
                
                Spacer()
                
                // Toggle Button
                Button(action: {
                    syncBeatsMode.toggle()
                    if syncBeatsMode {
                        NotificationCenter.default.post(name: NSNotification.Name("RoomJoined"), object: nil)
                    }
                }) {
                    Text(syncBeatsMode ? "⚡ Active: \(devices.filter { $0.isConnected }.count)" : "Turn On")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(syncBeatsMode ? (scheme == .dark ? .black : .white) : (scheme == .dark ? .white : .black))
                        .padding(.vertical, 8)
                        .padding(.horizontal, 16)
                        .background(syncBeatsMode ? Theme.Colors.primaryAccent(for: scheme) : Color.clear)
                        .cornerRadius(Theme.Radius.pillBadge)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.pillBadge)
                                .stroke(Theme.Colors.glassBorder(for: scheme), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(Theme.Spacing.containerPadding)
            .glassCard()
            .padding(.top, Theme.Spacing.containerPadding)
            
            // Invite Row & QR
            HStack(spacing: Theme.Spacing.rowGap) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("INVITE CODE")
                        .font(Theme.Fonts.mono(size: 9))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    
                    Text(inviteCode)
                        .font(Theme.Fonts.mono(size: 16))
                        .foregroundColor(scheme == .dark ? .white : .black)
                }
                
                Spacer()
                
                Button(action: {}) {
                    Image(systemName: "qrcode")
                        .font(.title3)
                }
                .buttonStyle(MonochromeSecondaryButtonStyle(cornerRadius: Theme.Radius.pillBadge))
                
                Button(action: {
                    // Copy invite code to clipboard
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(inviteCode, forType: .string)
                }) {
                    Text("Copy Link")
                }
                .buttonStyle(MonochromeSecondaryButtonStyle(cornerRadius: Theme.Radius.pillBadge))
            }
            .padding(.horizontal, Theme.Spacing.rowGap)
            
            // Synced Devices Title
            Text("Synced Devices")
                .font(Theme.Fonts.headline(size: 16))
                .foregroundColor(scheme == .dark ? .white : .black)
            
            // Grid of Devices
            ScrollView(.vertical, showsIndicators: true) {
                VStack(spacing: Theme.Spacing.rowGap) {
                    ForEach(devices.indices, id: \.self) { idx in
                        HStack(spacing: Theme.Spacing.containerPadding) {
                            
                            // Platform Icon
                            ZStack {
                                Circle()
                                    .fill(scheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.06))
                                    .frame(width: 40, height: 40)
                                
                                Image(systemName: platformIcon(for: devices[idx].platform))
                                    .foregroundColor(scheme == .dark ? .white : .black)
                            }
                            
                            // Name & Status text
                            VStack(alignment: .leading, spacing: 4) {
                                Text(devices[idx].name)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(scheme == .dark ? .white : .black)
                                
                                Text(devices[idx].statusText.uppercased())
                                    .font(Theme.Fonts.mono(size: 9))
                                    .foregroundColor(latencyColor(for: devices[idx].latency))
                            }
                            
                            Spacer()
                            
                            // Volume control slider (only if connected)
                            if devices[idx].isConnected {
                                HStack(spacing: 8) {
                                    Image(systemName: "speaker.wave.2.fill")
                                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                    Slider(value: $devices[idx].volume, in: 0...1)
                                        .frame(width: 100)
                                }
                            }
                            
                            // Sync badge
                            if devices[idx].isConnected {
                                Text(devices[idx].latency == 0 ? "HOST" : "\(devices[idx].latency)ms")
                                    .font(Theme.Fonts.mono(size: 10))
                                    .foregroundColor(latencyColor(for: devices[idx].latency))
                                    .padding(.vertical, 4)
                                    .padding(.horizontal, 8)
                                    .background(latencyColor(for: devices[idx].latency).opacity(0.12))
                                    .cornerRadius(4)
                            } else {
                                Text("OFFLINE")
                                    .font(Theme.Fonts.mono(size: 9))
                                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                            }
                        }
                        .padding(.vertical, Theme.Spacing.rowGap)
                        .padding(.horizontal, Theme.Spacing.rowGap)
                        .glassCard()
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.containerPadding)
    }
    
    // Helpers
    func platformIcon(for platform: String) -> String {
        switch platform {
        case "mac": return "desktopcomputer"
        case "phone": return "iphone"
        case "tablet": return "ipad"
        default: return "globe"
        }
    }
    
    func latencyColor(for latency: Int) -> Color {
        if latency == 0 { return .green }
        if latency < 25 { return .green }
        if latency < 100 { return .orange }
        return .red
    }
}

#Preview {
    DevicesView()
        .preferredColorScheme(.dark)
}
