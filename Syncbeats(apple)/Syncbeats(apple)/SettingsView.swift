import SwiftUI

struct SettingsView: View {
    @Environment(AuthStore.self) var authStore
    @Environment(\.colorScheme) var scheme
    @State private var serverAddress = "https://sync.syncbeats.dev"
    @State private var pingTime = 18
    @State private var selectedAudioOutput = "MacBook Pro Speakers"
    
    let audioOutputs = [
        "MacBook Pro Speakers",
        "Studio Monitor (USB-C)",
        "AirPods Pro (Bluetooth)",
        "System Output (Default)"
    ]
    
    var userName: String {
        if case let .signedIn(user) = authStore.state {
            return user.name
        }
        return "Abhinay Manikanta"
    }
    
    var userEmail: String {
        if case let .signedIn(user) = authStore.state {
            return user.email
        }
        return "abhinay@syncbeats.dev"
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
                        
                        // Status dot + Ping
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 6, height: 6)
                            
                            Text("\(pingTime) ms")
                                .font(Theme.Fonts.mono())
                                .foregroundColor(.green)
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
                        
                        Picker("", selection: $selectedAudioOutput) {
                            ForEach(audioOutputs, id: \.self) { output in
                                Text(output).tag(output)
                            }
                        }
                        .pickerStyle(.menu)
                        .frame(width: 220)
                    }
                    
                    Text("Select a hardware device to bind audio clock. Dynamic drift correction automatically handles AirPods and external monitors.")
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
