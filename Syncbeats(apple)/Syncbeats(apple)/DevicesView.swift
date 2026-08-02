import SwiftUI
import Combine
struct DevicesView: View {
    @Environment(\.colorScheme) var scheme
    @Environment(AuthStore.self) var authStore

    // Live room sync client — single source of truth for participants + connection.
    @State private var room = RoomSocket.shared
    @State private var engine = PlayerEngine.shared

    @State private var isStarting = false
    @State private var errorText: String?
    @State private var userDevices: [UserDevice] = []
    @State private var customRoomCode: String = ""
    @State private var isJoiningCustom = false
    let timer = Timer.publish(every: 5, on: .main, in: .common).autoconnect()

    private var currentUser: User? {
        if case let .signedIn(user) = authStore.state { return user }
        return nil
    }

    /// Room id doubles as the invite code.
    private var inviteCode: String { room.roomId ?? "—" }
    private var isActive: Bool { room.roomId != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {

            // SyncBeats Mode Controller Card
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text("SyncBeats Mode")
                            .font(Theme.Fonts.headline(size: 18))
                            .foregroundColor(scheme == .dark ? .white : .black)
                    }

                    Text("Broadcast and sync audio latency dynamically across multiple devices.")
                        .font(Theme.Fonts.body(size: 12))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }

                Spacer()

                // Toggle Button — joins user's default room.
                Button(action: toggleSyncMode) {
                    Group {
                        if isStarting {
                            ProgressView().controlSize(.small)
                        } else if isActive {
                            Text("Active (\(room.participants.count))")
                        } else {
                            Text("Turn On")
                        }
                    }
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundColor(isActive ? (scheme == .dark ? .black : .white) : (scheme == .dark ? .white : .black))
                    .padding(.vertical, 8)
                    .padding(.horizontal, 16)
                    .background(isActive ? Theme.Colors.primaryAccent(for: scheme) : Color.clear)
                    .cornerRadius(Theme.Radius.pillBadge)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.pillBadge)
                            .stroke(Theme.Colors.glassBorder(for: scheme), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .disabled(isStarting)
            }
            .padding(Theme.Spacing.containerPadding)
            .glassCard()
            .padding(.top, Theme.Spacing.containerPadding)

            // Join Someone Else's Room Section
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Join Another Room")
                        .font(Theme.Fonts.headline(size: 14))
                        .foregroundColor(scheme == .dark ? .white : .black)
                    Text("Enter a 6-digit invite code to sync with another device or friend.")
                        .font(Theme.Fonts.body(size: 11))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }

                Spacer()

                HStack(spacing: 8) {
                    TextField("Room Code (e.g. 123456)", text: $customRoomCode)
                        .textFieldStyle(.plain)
                        .font(Theme.Fonts.mono(size: 12))
                        .foregroundColor(scheme == .dark ? .white : .black)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 10)
                        .background(scheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
                        .cornerRadius(6)
                        .frame(width: 180)

                    Button(action: joinCustomRoom) {
                        Group {
                            if isJoiningCustom {
                                ProgressView().controlSize(.small)
                            } else {
                                Text("Join")
                            }
                        }
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(scheme == .dark ? .black : .white)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 14)
                        .background(Theme.Colors.primaryAccent(for: scheme))
                        .cornerRadius(Theme.Radius.pillBadge)
                    }
                    .buttonStyle(.plain)
                    .disabled(customRoomCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isJoiningCustom)
                }
            }
            .padding(Theme.Spacing.containerPadding)
            .glassCard()

            if let errorText {
                Text(errorText)
                    .font(Theme.Fonts.body(size: 11))
                    .foregroundColor(.red)
                    .padding(.horizontal, Theme.Spacing.containerPadding)
            }

            // Invite Row & QR
            HStack(spacing: Theme.Spacing.rowGap) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("CURRENT ROOM CODE")
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
                .disabled(!isActive)

                Button(action: {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(inviteCode, forType: .string)
                }) {
                    Text("Copy Code")
                }
                .buttonStyle(MonochromeSecondaryButtonStyle(cornerRadius: Theme.Radius.pillBadge))
                .disabled(!isActive)
            }
            .padding(.horizontal, Theme.Spacing.rowGap)

            // Your Devices Title
            HStack {
                Text("Your Devices")
                    .font(Theme.Fonts.headline(size: 16))
                    .foregroundColor(scheme == .dark ? .white : .black)
                Spacer()
                if isActive {
                    Text(room.isConnected ? "CONNECTED" : "CONNECTING…")
                        .font(Theme.Fonts.mono(size: 9))
                        .foregroundColor(room.isConnected ? .green : .orange)
                }
            }

            // Grid of Devices — global devices fetched from backend.
            ScrollView(.vertical, showsIndicators: true) {
                VStack(spacing: Theme.Spacing.rowGap) {
                    if userDevices.isEmpty {
                        emptyState
                    } else {
                        let nativeDevices = userDevices.filter { !$0.isWeb }
                        let webDevices = userDevices.filter { $0.isWeb }

                        if !nativeDevices.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Native App")
                                    .font(Theme.Fonts.mono(size: 10))
                                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                    .padding(.top, 4)
                                ForEach(nativeDevices) { device in
                                    globalDeviceRow(for: device)
                                }
                            }
                        }

                        if !webDevices.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Web App")
                                    .font(Theme.Fonts.mono(size: 10))
                                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                    .padding(.top, 4)
                                ForEach(webDevices) { device in
                                    globalDeviceRow(for: device)
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.containerPadding)
        .onAppear {
            if let user = currentUser {
                room.currentUser = (id: user.id, displayName: user.name)
            }
            fetchDevices()
        }
        .onReceive(timer) { _ in
            fetchDevices()
        }
    }
    
    private func fetchDevices() {
        Task {
            do {
                let devices = try await APIClient.shared.fetchMyDevices()
                await MainActor.run {
                    self.userDevices = devices.sorted { $0.last_seen_at > $1.last_seen_at }
                }
            } catch {
                print("[DevicesView] Error fetching devices: \(error)")
            }
        }
    }

    // MARK: - Subviews

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: isActive ? "person.2.wave.2" : "wifi.slash")
                .font(.system(size: 24))
                .foregroundColor(Theme.Colors.textMuted(for: scheme))
            Text(isActive ? "Waiting for devices to join…" : "Turn on SyncBeats Mode to start a room")
                .font(Theme.Fonts.body(size: 12))
                .foregroundColor(Theme.Colors.textMuted(for: scheme))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func globalDeviceRow(for device: UserDevice) -> some View {
        let isSelf = device.device_key == DeviceIdentity.shared.id

        return HStack(spacing: Theme.Spacing.containerPadding) {
            ZStack {
                Circle()
                    .fill(scheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.06))
                    .frame(width: 40, height: 40)
                Image(systemName: device.isWeb ? "globe" : "desktopcomputer")
                    .foregroundColor(scheme == .dark ? .white : .black)
            }
            .opacity(device.isOnline ? 1.0 : 0.4)

            VStack(alignment: .leading, spacing: 4) {
                Text(device.name + (isSelf ? " (This Device)" : ""))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .white : .black)
                    .opacity(device.isOnline ? 1.0 : 0.4)

                if device.isOnline {
                    Text("ACTIVE")
                        .font(Theme.Fonts.mono(size: 9))
                        .foregroundColor(.green)
                } else {
                    Text("OFFLINE")
                        .font(Theme.Fonts.mono(size: 9))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }
            }

            Spacer()

            if let rId = device.roomId {
                HStack(spacing: 4) {
                    Circle()
                        .fill(Color.blue)
                        .frame(width: 6, height: 6)
                    Text("in room: \(rId)")
                        .font(Theme.Fonts.mono(size: 10))
                        .foregroundColor(.blue)
                }
                .padding(.vertical, 4)
                .padding(.horizontal, 8)
                .background(Color.blue.opacity(0.12))
                .cornerRadius(4)
            } else if device.isOnline {
                HStack(spacing: 4) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 6, height: 6)
                    Text("Online")
                        .font(Theme.Fonts.mono(size: 10))
                        .foregroundColor(.green)
                }
            }
        }
        .padding(.vertical, 4)
        .padding(.vertical, Theme.Spacing.rowGap)
        .padding(.horizontal, Theme.Spacing.rowGap)
        .glassCard()
    }

    // MARK: - Actions

    private func toggleSyncMode() {
        if isActive {
            room.leaveRoom()
            return
        }
        guard let user = currentUser else {
            errorText = "Sign in to start a room."
            return
        }
        errorText = nil
        isStarting = true
        room.currentUser = (id: user.id, displayName: user.name)

        Task {
            do {
                // Fetch or create user's persistent default room (POST /rooms/default → { roomId }).
                struct DefaultRoomResponse: Decodable { let roomId: String }
                struct EmptyBody: Encodable {}
                let response: DefaultRoomResponse = try await APIClient.shared.post(path: "/rooms/default", body: EmptyBody())

                await MainActor.run {
                    room.joinRoom(response.roomId)
                    // Reveal the Dynamic Island in room-welcome mode.
                    NotificationCenter.default.post(
                        name: NSNotification.Name("RoomJoined"),
                        object: nil,
                        userInfo: ["roomId": response.roomId]
                    )
                    isStarting = false
                }
            } catch {
                await MainActor.run {
                    errorText = "Couldn't start default room: \(error.localizedDescription)"
                    isStarting = false
                }
            }
        }
    }

    private func joinCustomRoom() {
        let code = customRoomCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else { return }
        guard let user = currentUser else {
            errorText = "Sign in to join a room."
            return
        }
        errorText = nil
        isJoiningCustom = true
        room.currentUser = (id: user.id, displayName: user.name)

        // Leave current room if already in one
        if isActive {
            room.leaveRoom()
        }

        room.joinRoom(code)
        NotificationCenter.default.post(
            name: NSNotification.Name("RoomJoined"),
            object: nil,
            userInfo: ["roomId": code]
        )
        customRoomCode = ""
        isJoiningCustom = false
    }

    // Helpers
    func latencyColor(for latency: Int) -> Color {
        if latency < 25 { return .green }
        if latency < 100 { return .orange }
        return .red
    }
}
