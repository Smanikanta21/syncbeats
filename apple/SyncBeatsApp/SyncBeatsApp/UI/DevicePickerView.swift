import SwiftUI
import MultipeerConnectivity

struct DevicePickerView: View {
    @Environment(\.presentationMode) var presentationMode
    @State private var yourDevices: [PublicDevice] = []
    @State private var isLoading = true
    @State private var errorMessage: String? = nil
    
    @ObservedObject var nearbyManager = NearbyDeviceManager.shared
    @ObservedObject var socketManager = SocketManager.shared
    
    var body: some View {
        NavigationView {
            List {
                // Section 0: SyncBeat Mode
                Section {
                    Toggle(isOn: Binding(
                        get: { socketManager.isSyncBeatMode },
                        set: { _ in socketManager.toggleSyncBeatMode() }
                    )) {
                        VStack(alignment: .leading) {
                            Text("SyncBeat Mode")
                                .font(.headline)
                                .foregroundColor(socketManager.isSyncBeatMode ? .accentColor : .primary)
                            Text("Automatically sync playback with all your other online devices.")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        socketManager.toggleSyncBeatMode()
                    }
                }
                
                // Section 1: Nearby Devices (Real via MultipeerConnectivity)
                Section {
                    if nearbyManager.discoveredPeers.isEmpty {
                        Text("Searching for nearby devices...")
                            .foregroundColor(.secondary)
                            .font(.system(size: 14))
                    } else {
                        ForEach(nearbyManager.discoveredPeers, id: \.self) { peer in
                            Button(action: {
                                // Action to request connection to this peer later
                                presentationMode.wrappedValue.dismiss()
                            }) {
                                HStack {
                                    Image(systemName: "iphone") // Can be dynamically set later if we pass info
                                        .font(.system(size: 20))
                                        .foregroundColor(.primary)
                                        .frame(width: 30)
                                    Text(peer.name)
                                        .foregroundColor(.primary)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundColor(.secondary)
                                        .font(.system(size: 14))
                                }
                            }
                        }
                    }
                } header: {
                    Text("Nearby Devices")
                } footer: {
                    Text("These devices are on your local network.")
                }
                
                // Section 2: Your Devices (Real from API)
                Section {
                    if isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    } else if let error = errorMessage {
                        Text(error)
                            .foregroundColor(.red)
                    } else if yourDevices.isEmpty {
                        Text("No devices online.")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(yourDevices, id: \.id) { device in
                            Button(action: {
                                // Real action to connect via Socket later
                                presentationMode.wrappedValue.dismiss()
                            }) {
                                HStack {
                                    Image(systemName: getDeviceIcon(key: device.device_key))
                                        .font(.system(size: 20))
                                        .foregroundColor(.primary)
                                        .frame(width: 30)
                                    
                                    VStack(alignment: .leading) {
                                        Text(getDeviceName(key: device.device_key))
                                            .foregroundColor(.primary)
                                        Text(device.device_key == SessionManager.shared.deviceId ? "This device" : "Online")
                                            .font(.caption)
                                            .foregroundColor(.green)
                                    }
                                    
                                    Spacer()
                                    
                                    if device.device_key == SessionManager.shared.deviceId {
                                        Text("Current")
                                            .font(.caption)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.green.opacity(0.2))
                                            .foregroundColor(.green)
                                            .cornerRadius(8)
                                    } else {
                                        Image(systemName: "chevron.right")
                                            .foregroundColor(.secondary)
                                            .font(.system(size: 14))
                                    }
                                }
                            }
                        }
                    }
                } header: {
                    Text("Your Devices")
                } footer: {
                    Text("Devices logged into your SyncBeats account.")
                }
            }
            .navigationTitle("Sync with Device")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {
                        fetchDevices()
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
            }
            .onAppear {
                nearbyManager.start()
                fetchDevices()
            }
            .onDisappear {
                nearbyManager.stop()
            }
        }
    }
    
    // MARK: - Logic
    
    private func fetchDevices() {
        isLoading = true
        NetworkManager.shared.getDevices { result in
            DispatchQueue.main.async {
                self.isLoading = false
                switch result {
                case .success(let response):
                    self.yourDevices = response.devices.filter {
                        ($0.device_key.hasPrefix("IOS-") ||
                        $0.device_key.hasPrefix("MAC-") ||
                        $0.device_key.hasPrefix("ANDROID-") ||
                        $0.device_key.hasPrefix("WINDOWS-")) &&
                        $0.isOnline == true
                    }
                case .failure(let error):
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }
    
    private func getDeviceIcon(key: String) -> String {
        if key.hasPrefix("IOS-") {
            return "iphone"
        } else if key.hasPrefix("MAC-") {
            return "desktopcomputer"
        } else if key.hasPrefix("ANDROID-") {
            return "candybarphone"
        } else if key.hasPrefix("WINDOWS-") {
            return "pc"
        }
        return "laptopcomputer"
    }
    
    private func getDeviceName(key: String) -> String {
        if key.hasPrefix("IOS-") {
            return "iPhone"
        } else if key.hasPrefix("MAC-") {
            return "Mac"
        } else if key.hasPrefix("ANDROID-") {
            return "Android"
        } else if key.hasPrefix("WINDOWS-") {
            return "Windows"
        }
        return "Web Browser"
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: dateString) {
            let displayFormatter = RelativeDateTimeFormatter()
            displayFormatter.unitsStyle = .full
            return displayFormatter.localizedString(for: date, relativeTo: Date())
        }
        return dateString
    }
}

#Preview {
    DevicePickerView()
}
