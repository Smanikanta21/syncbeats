import SwiftUI

struct ProfileScreen: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var socketManager = SocketManager.shared
    @State private var devices: [PublicDevice] = []
    @State private var showClearCacheAlert = false
    
    var body: some View {
        NavigationView {
            List {
                // Profile Header
                Section {
                    HStack(spacing: 16) {
                        Image(systemName: "person.crop.circle.fill")
                            .resizable()
                            .frame(width: 64, height: 64)
                            .foregroundColor(.blue)
                            .padding(.vertical, 8)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            if let user = appState.currentUser {
                                Text(user.name).font(.title3).fontWeight(.bold)
                                Text(user.email).font(.subheadline).foregroundColor(.secondary)
                                
                                HStack(spacing: 6) {
                                    Circle()
                                        .fill(socketManager.isConnected ? Color.green : Color.red)
                                        .frame(width: 8, height: 8)
                                    Text(socketManager.isConnected ? "Server Connected" : "Server Disconnected")
                                        .font(.caption2)
                                        .foregroundColor(socketManager.isConnected ? .green : .red)
                                }
                                .padding(.top, 2)
                            } else {
                                Text("User Profile").font(.title3).fontWeight(.bold)
                            }
                        }
                    }
                }
                
                // Devices Section
                Section(header: Text("My Devices")) {
                    if devices.isEmpty {
                        Text("No devices found").foregroundColor(.secondary)
                    } else {
                        ForEach(devices) { device in
                            HStack {
                                // Platform Icon
                                if device.device_key.hasPrefix("IOS-") {
                                    Image(systemName: "iphone").foregroundColor(.blue)
                                } else if device.device_key.hasPrefix("MAC-") {
                                    Image(systemName: "desktopcomputer").foregroundColor(.blue)
                                } else if device.device_key.hasPrefix("ANDROID-") {
                                    Image(systemName: "candybarphone").foregroundColor(.green)
                                } else if device.device_key.hasPrefix("WINDOWS-") {
                                    Image(systemName: "pc").foregroundColor(.blue)
                                } else {
                                    Image(systemName: "candybarphone").foregroundColor(.gray)
                                }
                                
                                let formatted = formatLastSeen(device.last_seen_at)
                                
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(formatDeviceName(originalName: device.name, deviceKey: device.device_key))
                                        .font(.headline)
                                    
                                    HStack(spacing: 4) {
                                        let isOnline = device.isOnline ?? false
                                        Circle()
                                            .fill(isOnline ? Color.green : Color.gray)
                                            .frame(width: 8, height: 8)
                                        Text(isOnline ? "Online" : formatted.text)
                                            .font(.caption)
                                            .foregroundColor(isOnline ? .green : .secondary)
                                        
                                        if device.isCurrentDevice == true {
                                            Text("• This Device")
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                }
                                Spacer()
                                Button(action: {
                                    socketManager.pingDevice(targetDeviceKey: device.device_key)
                                }) {
                                    Image(systemName: "dot.radiowaves.left.and.right")
                                        .foregroundColor(.blue)
                                        .padding(8)
                                        .background(Color.blue.opacity(0.1))
                                        .clipShape(Circle())
                                }
                                .buttonStyle(BorderlessButtonStyle())
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
                
                // Settings Section
                Section(header: Text("Settings")) {
                    NavigationLink(destination: SettingsScreen()) {
                        Label("App Settings", systemImage: "gear")
                    }
                    Button(action: { showClearCacheAlert = true }) {
                        Label("Clear Cached Audio", systemImage: "trash")
                            .foregroundColor(.red)
                    }
                }
                
                // Account Section
                Section {
                    Button(action: { appState.logout() }) {
                        Text("Log Out")
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
            }
            .listStyle(InsetGroupedListStyle())
            .navigationTitle("Profile")
            .refreshable {
                fetchDevices()
            }
            .onAppear { fetchDevices() }
            .alert(isPresented: $showClearCacheAlert) {
                Alert(
                    title: Text("Clear Cache"),
                    message: Text("Are you sure you want to delete all downloaded audio files?"),
                    primaryButton: .destructive(Text("Clear")) {
                        clearCache()
                    },
                    secondaryButton: .cancel()
                )
            }
        }
    }
    
    private func fetchDevices() {
        NetworkManager.shared.getDevices { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let response):
                    let appPrefixes = ["IOS-", "MAC-", "ANDROID-", "WINDOWS-", "APP-"]
                    self.devices = response.devices.filter { device in
                        appPrefixes.contains { device.device_key.hasPrefix($0) }
                    }
                    print("[ProfileScreen] Fetched \(self.devices.count) devices successfully.")
                case .failure(let error):
                    print("[ProfileScreen] Failed to fetch devices: \(error)")
                }
            }
        }
    }
    
    private func clearCache() {
        // Clear audio files and library
        let tracks = LibraryManager.shared.downloadedTracks
        for track in tracks {
            LibraryManager.shared.deleteTrack(track.id)
        }
    }
    
    // MARK: - Formatters
    
    private func formatDeviceName(originalName: String, deviceKey: String) -> String {
        // e.g., "Abhinay Siraparapu's Device" -> "Abhinay"
        let firstName = originalName.components(separatedBy: " ").first?.replacingOccurrences(of: "'s", with: "") ?? originalName
        
        if deviceKey.hasPrefix("IOS-") { return "\(firstName)'s iPhone" }
        if deviceKey.hasPrefix("MAC-") { return "\(firstName)'s Mac" }
        if deviceKey.hasPrefix("ANDROID-") { return "\(firstName)'s Android" }
        if deviceKey.hasPrefix("WINDOWS-") { return "\(firstName)'s Windows PC" }
        return originalName
    }
    
    private func parseDate(from string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }
    
    private func formatLastSeen(_ dateString: String) -> (text: String, isOnline: Bool) {
        guard let date = parseDate(from: dateString) else {
            return ("Offline", false)
        }
        
        let now = Date()
        let diff = now.timeIntervalSince(date)
        
        // If seen in the last 3 minutes, consider it online
        if diff < 180 {
            return ("Online", true)
        }
        
        // Format relative time
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        let relativeString = formatter.localizedString(for: date, relativeTo: now)
        
        // Capitalize the first letter
        let capitalizedRelative = relativeString.prefix(1).capitalized + relativeString.dropFirst()
        return ("Offline • \(capitalizedRelative)", false)
    }
}

#Preview {
    ProfileScreen()
        .environmentObject(AppState())
}
