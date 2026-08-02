import SwiftUI

struct SettingsView: View {
    @Environment(AuthStore.self) var authStore
    @Environment(\.colorScheme) var scheme
    @State private var room = RoomSocket.shared

    /// Real backend address the app is talking to (APIClient is the single source).
    private var serverAddress: String { APIClient.shared.baseURL }
    /// Live latency from the NTP burst; 0 until the first sync completes.
    private var pingTime: Int { room.latencyMs }
    private var isConnected: Bool { room.isConnected }

    var userName: String {
        if case let .signedIn(user) = authStore.state {
            return user.name
        }
        return "—"
    }

    var userEmail: String {
        if case let .signedIn(user) = authStore.state {
            return user.email
        }
        return "—"
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {
            
            // Title
            Text("Settings")
                .font(Theme.Fonts.headline(size: 32))
                .foregroundColor(scheme == .dark ? .white : .black)
                .padding(.top, Theme.Spacing.containerPadding)
            
            // Spotify Connection
            VStack(alignment: .leading, spacing: Theme.Spacing.rowGap) {
                Text("Spotify Account")
                    .font(Theme.Fonts.headline(size: 16))
                    .foregroundColor(scheme == .dark ? .white : .black)
                
                HStack(spacing: Theme.Spacing.rowGap) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 44, height: 44)
                        .overlay(
                            Image(systemName: "person.fill")
                                .foregroundColor(.white)
                        )
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text(userName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(scheme == .dark ? .white : .black)
                        Text(userEmail)
                            .font(Theme.Fonts.body(size: 11))
                            .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    }
                    
                    Spacer()
                    
                    Button("Disconnect") {
                        authStore.logout()
                    }
                        .buttonStyle(MonochromeSecondaryButtonStyle(cornerRadius: Theme.Radius.pillBadge))
                }
                .padding(Theme.Spacing.rowGap)
                .glassCard()
            }
            
            // Sync Server Settings
            VStack(alignment: .leading, spacing: Theme.Spacing.rowGap) {
                Text("Sync Server")
                    .font(Theme.Fonts.headline(size: 16))
                    .foregroundColor(scheme == .dark ? .white : .black)
                
                VStack(alignment: .leading, spacing: Theme.Spacing.rowGap) {
                    HStack {
                        Text("Server Address")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(scheme == .dark ? .white : .black)
                        Spacer()
                        Text(serverAddress)
                            .font(Theme.Fonts.mono())
                            .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    }
                    
                    HStack {
                        Text("Connection Latency")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(scheme == .dark ? .white : .black)
                        Spacer()

                        // Status dot + Ping — reflects the live NTP sync state.
                        HStack(spacing: 6) {
                            Circle()
                                .fill(isConnected ? Color.green : Color.gray)
                                .frame(width: 6, height: 6)

                            Text(isConnected ? "\(pingTime) ms" : "Not connected")
                                .font(Theme.Fonts.mono())
                                .foregroundColor(isConnected ? .green : Theme.Colors.textMuted(for: scheme))
                        }
                    }
                }
                .padding(Theme.Spacing.rowGap)
                .glassCard()
            }
            
            // Audio Hardware Picker
            VStack(alignment: .leading, spacing: Theme.Spacing.rowGap) {
                Text("Audio Configuration")
                    .font(Theme.Fonts.headline(size: 16))
                    .foregroundColor(scheme == .dark ? .white : .black)

                VStack(alignment: .leading, spacing: Theme.Spacing.rowGap) {
                    HStack {
                        Text("Output Device")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(scheme == .dark ? .white : .black)

                        Spacer()

                        // Audio plays through the macOS system output; change it in
                        // System Settings ▸ Sound. Drift correction handles the rest.
                        Text("System Output")
                            .font(Theme.Fonts.mono())
                            .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    }

                    Text("Audio is bound to your system output device. Dynamic drift correction automatically handles AirPods and external monitors.")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }
                .padding(Theme.Spacing.rowGap)
                .glassCard()
            }
            
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.containerPadding)
    }
}

#Preview {
    SettingsView()
        .preferredColorScheme(.dark)
}
