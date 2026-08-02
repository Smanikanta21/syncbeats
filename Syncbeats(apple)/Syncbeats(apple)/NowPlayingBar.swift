import SwiftUI

struct NowPlayingBar: View {
    @Environment(\.colorScheme) var scheme
    @Environment(AuthStore.self) var authStore
    @Binding var showQueue: Bool
    @State private var engine = PlayerEngine.shared
    @State private var showStats = false
    @State private var isScrubbing = false
    @State private var scrubValue: Double = 0

    @State private var isStartingRoom = false
    @State private var showSignInReminder = false
    let roomSocket = RoomSocket.shared

    private var track: PlayableTrack? { engine.current }

    var body: some View {
        HStack(spacing: Theme.Spacing.containerPadding) {

            // Left: Track Details & Artwork
            HStack(spacing: Theme.Spacing.rowGap) {
                artwork

                VStack(alignment: .leading, spacing: 2) {
                    Text(track?.title ?? "Nothing playing")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .white : .black)
                        .lineLimit(1)

                    Text(track?.artist ?? "Pick a song to start")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                        .lineLimit(1)
                }
            }
            .frame(width: 220, alignment: .leading)

            // Middle: Player controls & seek bar
            VStack(spacing: 6) {
                // Controls
                HStack(spacing: 20) {
                    Button(action: { engine.prev() }) {
                        Image(systemName: "backward.fill")
                    }
                    .buttonStyle(.plain)
                    .disabled(!engine.canGoPrev)

                    Button(action: { engine.togglePlayPause() }) {
                        ZStack {
                            if engine.isLoading || engine.isBuffering {
                                ProgressView().controlSize(.small)
                            } else {
                                Image(systemName: engine.isPlaying ? "pause.fill" : "play.fill")
                                    .font(.title2)
                            }
                        }
                        .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .disabled(!engine.hasTrack)

                    Button(action: { engine.next() }) {
                        Image(systemName: "forward.fill")
                    }
                    .buttonStyle(.plain)
                    .disabled(!engine.canGoNext)
                }
                .foregroundColor(scheme == .dark ? .white : .black)

                // Seek line
                HStack(spacing: 8) {
                    Text(Self.fmt(engine.currentTime))
                        .font(Theme.Fonts.mono(size: 10))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                        .frame(width: 34, alignment: .trailing)

                    Slider(
                        value: Binding(
                            get: { isScrubbing ? scrubValue : engine.progress },
                            set: { scrubValue = $0; isScrubbing = true }
                        ),
                        in: 0...1,
                        onEditingChanged: { editing in
                            if !editing {
                                engine.progress = scrubValue
                                isScrubbing = false
                            }
                        }
                    )
                    .accentColor(Theme.Colors.primaryAccent(for: scheme))
                    .disabled(!engine.hasTrack || engine.duration <= 0)

                    Text(Self.fmt(engine.duration))
                        .font(Theme.Fonts.mono(size: 10))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                        .frame(width: 34, alignment: .leading)
                }
            }
            .frame(maxWidth: .infinity)

            // Right: Waveform and Stats badge
            HStack(spacing: Theme.Spacing.rowGap) {
                // Animated Waveform — only "moves" while playing
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(0..<5, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Theme.Colors.primaryAccent(for: scheme))
                            .frame(width: 2, height: barHeight(i))
                    }
                }
                .frame(width: 20, height: 20)
                .opacity(engine.isPlaying ? 1 : 0.3)

                // Queue toggle button
                Button(action: {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        showQueue.toggle()
                    }
                }) {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(showQueue ? Theme.Colors.primaryAccent(for: scheme) : Theme.Colors.textMuted(for: scheme))
                        .frame(width: 24, height: 24)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Queue")

                // SyncBeats Mode Controller Button
                if let roomId = roomSocket.roomId {
                    // Sync active state — clicking toggles stats popover
                    Button(action: { showStats.toggle() }) {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 6, height: 6)
                            Text("sync \(roomSocket.latencyMs)ms")
                                .font(Theme.Fonts.mono(size: 10))
                        }
                        .padding(.vertical, 4)
                        .padding(.horizontal, 8)
                        .background(Color.green.opacity(0.12))
                        .foregroundColor(.green)
                        .cornerRadius(Theme.Radius.pillBadge)
                    }
                    .buttonStyle(.plain)
                    .help("SyncBeats Active: View Stats / Disconnect")
                    .popover(isPresented: $showStats) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("SyncBeats Active")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.primary)
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Room Code: \(roomId)")
                                Text("Offset drift: \(Int(roomSocket.clockOffset)) ms")
                                Text("RTT Latency: \(roomSocket.latencyMs) ms")
                            }
                            .font(Theme.Fonts.mono(size: 10))
                            .foregroundColor(.secondary)
                            
                            Divider()
                            
                            Button(role: .destructive, action: {
                                showStats = false
                                roomSocket.leaveRoom()
                            }) {
                                Text("Leave Room")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                        }
                        .padding(12)
                        .frame(width: 180)
                    }
                } else {
                    // Sync inactive state — clicking starts default room / joins
                    Button(action: {
                        if isStartingRoom { return }
                        toggleSyncMode()
                    }) {
                        HStack(spacing: 4) {
                            if isStartingRoom {
                                ProgressView()
                                    .controlSize(.small)
                                    .scaleEffect(0.6)
                                    .frame(width: 10, height: 10)
                            } else {
                                Image(systemName: "antenna.radiowaves.left.and.right")
                                    .font(.system(size: 10))
                            }
                            Text(isStartingRoom ? "Syncing..." : "SyncBeats")
                                .font(Theme.Fonts.body(size: 10).weight(.medium))
                        }
                        .padding(.vertical, 4)
                        .padding(.horizontal, 8)
                        .background(Theme.Colors.primaryAccent(for: scheme).opacity(0.12))
                        .foregroundColor(Theme.Colors.primaryAccent(for: scheme))
                        .cornerRadius(Theme.Radius.pillBadge)
                    }
                    .buttonStyle(.plain)
                    .help("Turn on SyncBeats Mode")
                    .popover(isPresented: $showSignInReminder) {
                        Text("Please sign in first to use SyncBeats mode.")
                            .font(.system(size: 11))
                            .padding(10)
                    }
                }
            }
            .frame(width: 200, alignment: .trailing)
        }
        .padding(.horizontal, Theme.Spacing.containerPadding)
        .padding(.vertical, 14)
        .glassCard()
        .opacity(engine.hasTrack ? 1 : 0.65)
    }

    // MARK: - Artwork

    @ViewBuilder
    private var artwork: some View {
        let placeholder = RoundedRectangle(cornerRadius: 6)
            .fill(LinearGradient(colors: [Color.gray, Color.black], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(Image(systemName: "music.note").foregroundColor(.white))

        Group {
            if let url = track?.artworkURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image): image.resizable().aspectRatio(contentMode: .fill)
                    case .empty: placeholder
                    case .failure: placeholder
                    @unknown default: placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    // Deterministic bar heights (no Date/random — respects sandbox rules and stays stable).
    private func barHeight(_ i: Int) -> CGFloat {
        let base: [CGFloat] = [8, 16, 6, 18, 10]
        return base[i % base.count]
    }

    private func toggleSyncMode() {
        guard case let .signedIn(user) = authStore.state else {
            showSignInReminder = true
            return
        }
        
        isStartingRoom = true
        roomSocket.currentUser = (id: user.id, displayName: user.name)
        
        Task {
            do {
                struct DefaultRoomResponse: Decodable { let roomId: String }
                struct EmptyBody: Encodable {}
                let response: DefaultRoomResponse = try await APIClient.shared.post(path: "/rooms/default", body: EmptyBody())
                
                await MainActor.run {
                    roomSocket.joinRoom(response.roomId)
                    NotificationCenter.default.post(
                        name: NSNotification.Name("RoomJoined"),
                        object: nil,
                        userInfo: ["roomId": response.roomId]
                    )
                    isStartingRoom = false
                }
            } catch {
                print("[NowPlayingBar] Failed to auto-start room:", error)
                await MainActor.run {
                    isStartingRoom = false
                }
            }
        }
    }

    private static func fmt(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "0:00" }
        let t = Int(seconds)
        return String(format: "%d:%02d", t / 60, t % 60)
    }
}

#Preview {
    NowPlayingBar(showQueue: .constant(false))
        .preferredColorScheme(.dark)
}
