import SwiftUI
import MusicKit

enum RightPanelTab: String, CaseIterable, Identifiable {
    case upNext = "Up Next"
    case library = "Library"

    var id: String { rawValue }
}

struct RoomView: View {
    let roomId: String

    @ObservedObject private var room = RoomManager.shared
    @ObservedObject private var auth = AuthManager.shared
    @StateObject private var library = MusicLibraryService()
    @ObservedObject private var cache = TrackCache.shared
    @State private var scrubProgress: Double?
    @State private var showProfile = false
    @State private var showAmbientSettings = false
    @State private var showAudioOutputs = false
    @State private var searchText = ""
    @State private var rightPanelTab: RightPanelTab = .upNext
    @State private var showClearConfirm = false

    #if os(macOS)
    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 320)
        } content: {
            player
                .navigationSplitViewColumnWidth(min: 380, ideal: 460)
        } detail: {
            queueAndLibrary
                .navigationSplitViewColumnWidth(min: 280, ideal: 330, max: 420)
        }
        .task(id: roomId) { room.connect(roomId: roomId) }
        .toolbar { toolbarContent }
        .sheet(isPresented: $showProfile) {
            ProfileView(roomId: roomId)
        }
        .sheet(isPresented: $showAmbientSettings) {
            AmbientSettingsView(artworkURL: room.currentTrack?.artworkURL)
        }
        .alert(
            "Something went wrong",
            isPresented: Binding(get: { room.lastError != nil }, set: { if !$0 { room.lastError = nil } })
        ) {
            Button("OK", role: .cancel) { room.lastError = nil }
        } message: {
            Text(room.lastError ?? "")
        }
        .alert(
            "Bluetooth Speaker Detected",
            isPresented: Binding(
                get: { DeviceManager.shared.newlyConnectedDevice != nil },
                set: { if !$0 { DeviceManager.shared.newlyConnectedDevice = nil } }
            )
        ) {
            Button("Enable Multi-Speaker Mode") {
                if let dev = DeviceManager.shared.newlyConnectedDevice {
                    Task {
                        do {
                            let latency = try await CalibrationService.shared.calibrate(deviceId: dev.id)
                            DeviceManager.shared.activeSecondaryDevices[dev.id] = latency
                        } catch {
                            RoomManager.shared.lastError = error.localizedDescription
                        }
                    }
                    DeviceManager.shared.newlyConnectedDevice = nil
                }
            }
            Button("Cancel", role: .cancel) {
                DeviceManager.shared.newlyConnectedDevice = nil
            }
        } message: {
            Text("Do you want to mirror the music to \(DeviceManager.shared.newlyConnectedDevice?.name ?? "this speaker") simultaneously?")
        }
    }
    #else
    @State private var selectedTab = 0

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                TabView(selection: $selectedTab) {
                    player
                        .tabItem { Label("Player", systemImage: "play.circle.fill") }
                        .tag(0)
                    
                    queueAndLibrary
                        .safeAreaInset(edge: .bottom) {
                            if room.currentTrack != nil {
                                Color.clear.frame(height: 80)
                            }
                        }
                        .tabItem { Label("Library", systemImage: "music.note.list") }
                        .tag(1)
                    
                    sidebar
                        .safeAreaInset(edge: .bottom) {
                            if room.currentTrack != nil {
                                Color.clear.frame(height: 80)
                            }
                        }
                        .tabItem { Label("Room", systemImage: "person.3.fill") }
                        .tag(2)
                }
                
                if selectedTab != 0, room.currentTrack != nil {
                    nowPlayingBar
                }
            }
            .task(id: roomId) { room.connect(roomId: roomId) }
            .toolbar { toolbarContent }
            .sheet(isPresented: $showProfile) {
                ProfileView(roomId: roomId)
            }
            .sheet(isPresented: $showAmbientSettings) {
                AmbientSettingsView(artworkURL: room.currentTrack?.artworkURL)
            }
            .alert(
                "Something went wrong",
                isPresented: Binding(get: { room.lastError != nil }, set: { if !$0 { room.lastError = nil } })
            ) {
                Button("OK", role: .cancel) { room.lastError = nil }
            } message: {
                Text(room.lastError ?? "")
            }
        }
    }

    private var nowPlayingBar: some View {
        HStack(spacing: 12) {
            ArtworkTile(url: room.currentTrack?.artworkURL, size: 44)
                .shadow(radius: 2)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(room.currentTrack?.title ?? "Nothing playing")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .lineLimit(1)
                Text(room.currentTrack?.artist ?? "--")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            
            Spacer(minLength: 0)
            
            Button(action: room.togglePlayPause) {
                Image(systemName: room.isPlaying ? "pause.fill" : "play.fill")
                    .font(.title2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            
            Button(action: room.next) {
                Image(systemName: "forward.fill")
                    .font(.title2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal)
        .padding(.bottom, 60)
        .shadow(color: .black.opacity(0.15), radius: 10, y: 5)
        .onTapGesture {
            selectedTab = 0
        }
    }
    #endif

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        #if os(macOS)
        ToolbarItem(placement: .principal) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField("Search YouTube or Paste Link...", text: $searchText)
                    .textFieldStyle(.plain)
                    .onSubmit {
                        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !query.isEmpty else { return }
                        Task { await room.enqueueSearch(query: query) }
                        searchText = ""
                    }
                if room.isEnqueueing {
                    ProgressView().controlSize(.small)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .frame(width: 320)
        }
        #endif
        
        ToolbarItem(placement: .primaryAction) {
            Button {
                Haptics.tap()
                showAmbientSettings = true
            } label: {
                Image(systemName: "sparkles")
            }
            .buttonStyle(.plain)
            .help("Ambient background")
            .accessibilityLabel("Ambient background")
        }
        ToolbarItem(placement: .primaryAction) {
            Button {
                Haptics.tap()
                showProfile = true
            } label: {
                AvatarBadge(name: auth.currentUser?.name ?? "?")
            }
            .buttonStyle(.plain)
            .help("Account")
            .accessibilityLabel("Account")
        }
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        List {
            Section {
                RoomSessionCard(
                    roomId: roomId,
                    connection: room.connection,
                    statusColor: statusColor,
                    transport: transportBinding,
                    onCopy: { copyToPasteboard(roomId) }
                )
                .listRowInsets(EdgeInsets(top: 8, leading: 6, bottom: 8, trailing: 6))
                .listRowBackground(Color.clear)
            }

            Section {
                if room.participants.isEmpty {
                    Text("No one connected yet")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 4)
                } else {
                    ForEach(room.participants) { participant in
                        ParticipantRow(participant: participant) { room.setVolume($0, for: participant) }
                    }
                }
            } header: {
                HStack {
                    Text("Listeners")
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Text("\(room.readyCount)/\(room.participants.count) ready")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }

            #if os(macOS)
            Section {
                Button {
                    showAudioOutputs.toggle()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "speaker.wave.2.fill")
                            .foregroundStyle(.tint)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Audio Routing & Multi-Speaker")
                                .font(.subheadline.weight(.medium))
                            let secCount = DeviceManager.shared.activeSecondaryDevices.count
                            Text(secCount > 0 ? "\(1 + secCount) outputs in sync" : "Mac audio output active")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showAudioOutputs) {
                    AudioOutputsPopover()
                }
            } header: {
                Text("Audio Routing")
                    .font(.caption.weight(.semibold))
            }
            #endif

            Section {
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 10) {
                        LabeledContent("Clock") {
                            Text(room.clock.isSynced
                                 ? "±\(Int(room.clock.rttMs / 2))ms · \(Int(room.clock.offsetMs))ms skew"
                                 : "Measuring…")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                        }

                        if Endpoint.transport == .lan {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Edge Node Host")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                TextField("host:port", text: lanHostBinding)
                                    .textFieldStyle(.roundedBorder)
                                    .font(.caption.monospaced())
                            }
                        }
                    }
                    .padding(.vertical, 4)
                } label: {
                    Label("Network Diagnostics", systemImage: "network")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.sidebar)
    }

    // MARK: - Player

    private var player: some View {
        ZStack {
            AmbientBackdrop(url: room.currentTrack?.artworkURL, videoUrl: room.currentAnimatedArtworkURL, isPlaying: room.isPlaying)

            VStack(spacing: 0) {
                Spacer(minLength: 24)

                VStack(spacing: 20) {
                    artwork
                    titles
                    scrubber
                    transport
                }
                .frame(maxWidth: 440)
                .padding(.horizontal, 24)

                Spacer(minLength: 24)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var artwork: some View {
        ArtworkTile(url: room.currentTrack?.artworkURL, size: 280)
            .shadow(
                color: .black.opacity(room.isPlaying ? 0.45 : 0.26),
                radius: room.isPlaying ? 34 : 22,
                y: room.isPlaying ? 18 : 11
            )
            .scaleEffect(room.isPlaying ? 1 : 0.94)
            .animation(.smooth(duration: 0.45, extraBounce: 0.18), value: room.isPlaying)
            .id(room.currentTrack?.id)
            .transition(.asymmetric(
                insertion: .scale(scale: 0.90).combined(with: .opacity),
                removal: .scale(scale: 1.05).combined(with: .opacity)
            ))
            .animation(.smooth(duration: 0.5), value: room.currentTrack?.id)
    }

    private var titles: some View {
        VStack(spacing: 6) {
            Text(room.currentTrack?.title ?? "Nothing playing")
                .font(.title2.weight(.bold))
                .lineLimit(1)
            Text(room.currentTrack?.artist ?? "Queue a track to begin")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 20)
        .multilineTextAlignment(.center)
        .contentTransition(.opacity)
        .animation(.smooth(duration: 0.35), value: room.currentTrack?.id)
    }

    private var scrubber: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !room.isPlaying)) { _ in
            let live = scrubProgress ?? room.progress
            VStack(spacing: 6) {
                Slider(
                    value: Binding(
                        get: { live },
                        set: { scrubProgress = $0 }
                    ),
                    in: 0...1,
                    onEditingChanged: { editing in
                        guard !editing, let p = scrubProgress else { return }
                        if room.durationSec > 0 {
                            Haptics.tap()
                            room.seek(toSeconds: p * room.durationSec)
                        }
                        scrubProgress = nil
                    }
                )
                .disabled(room.durationSec <= 0)

                HStack {
                    Text(timecode(live * room.durationSec))
                    Spacer()
                    Text(room.durationSec > 0 ? timecode(room.durationSec) : "--:--")
                }
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: 400)
    }

    private var transport: some View {
        HStack(spacing: 12) {
            Button(action: room.toggleShuffle) {
                Image(systemName: "shuffle")
            }
            .buttonStyle(GlyphButtonStyle(size: 13, tinted: room.shuffle))
            .help("Shuffle")

            Button(action: room.previous) {
                Image(systemName: "backward.fill")
            }
            .buttonStyle(GlyphButtonStyle())
            .help("Previous")

            Button(action: room.togglePlayPause) {
                Image(systemName: room.isPlaying ? "pause.fill" : "play.fill")
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(PlayButtonStyle())
            .keyboardShortcut(.space, modifiers: [])
            .help(room.isPlaying ? "Pause" : "Play")

            Button(action: room.next) {
                Image(systemName: "forward.fill")
            }
            .buttonStyle(GlyphButtonStyle())
            .help("Next")

            Button(action: room.cycleRepeat) {
                Image(systemName: room.repeatMode.symbol)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(GlyphButtonStyle(size: 13, tinted: room.repeatMode != .off))
            .help("Repeat")

            #if os(macOS)
            Divider()
                .frame(height: 18)
                .padding(.horizontal, 2)

            Button {
                showAudioOutputs.toggle()
            } label: {
                let secCount = DeviceManager.shared.activeSecondaryDevices.count
                HStack(spacing: 4) {
                    Image(systemName: secCount > 0 ? "speaker.wave.3.fill" : "speaker.wave.2")
                    if secCount > 0 {
                        Text("+\(secCount)")
                            .font(.system(size: 10, weight: .bold))
                    }
                }
            }
            .buttonStyle(GlyphButtonStyle(size: 13, tinted: !DeviceManager.shared.activeSecondaryDevices.isEmpty))
            .help("Audio Outputs & Multi-Speaker Setup")
            .popover(isPresented: $showAudioOutputs) {
                AudioOutputsPopover()
            }
            #endif
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .syncbeatsGlass(in: Capsule())
        .disabled(room.connection != .connected)
    }

    // MARK: - Queue + library

    private var queueAndLibrary: some View {
        VStack(spacing: 0) {
            Picker("Section", selection: $rightPanelTab) {
                Text("Up Next (\(room.upNext.count))").tag(RightPanelTab.upNext)
                Text("Apple Music").tag(RightPanelTab.library)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 8)

            Divider()

            switch rightPanelTab {
            case .upNext:
                if let current = room.currentTrack {
                    NowPlayingQueueCard(
                        item: current,
                        isPlaying: room.isPlaying,
                        durationSec: room.durationSec
                    )
                    Divider()
                }
                upNextList
            case .library:
                libraryList
            }
        }
        .task {
            if library.isAuthorized { await library.loadPlaylists() }
        }
        .onChange(of: library.selection) { _, playlist in
            Task {
                if let playlist { await library.loadTracks(for: playlist) }
                else { await library.loadAllSongs() }
            }
        }
        .confirmationDialog("Clear Queue?", isPresented: $showClearConfirm, titleVisibility: .visible) {
            Button("Clear All Upcoming", role: .destructive) {
                for item in room.upNext {
                    room.remove(item)
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to remove all upcoming songs from this session?")
        }
    }

    private var upNextList: some View {
        List {
            Section {
                if room.upNext.isEmpty {
                    EmptyQueueView {
                        rightPanelTab = .library
                    }
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(Array(room.upNext.enumerated()), id: \.element.id) { index, item in
                        QueueTrackRow(
                            index: index + 1,
                            item: item,
                            downloadState: cache.state(for: item),
                            onDownload: {
                                Haptics.tap()
                                Task { await cache.download(item) }
                            },
                            onRemove: {
                                Haptics.tap()
                                room.remove(item)
                            },
                            onDropAfter: { draggedId in
                                Haptics.tap()
                                Task { await room.moveAfter(itemId: draggedId, targetId: item.id) }
                            }
                        )
                        .onTapGesture {
                            Haptics.tap()
                            room.jump(to: item)
                        }
                        .contextMenu {
                            Button("Play Now") { room.jump(to: item) }
                            Button("Download") { Task { await cache.download(item) } }
                            Button("Remove", role: .destructive) { room.remove(item) }
                        }
                    }
                    .onDelete { indexSet in
                        for idx in indexSet {
                            if idx < room.upNext.count {
                                room.remove(room.upNext[idx])
                            }
                        }
                    }
                }
            } header: {
                HStack {
                    Text("Up Next")
                        .font(.caption.weight(.semibold))

                    Spacer()

                    if cache.activeCount > 0 {
                        Text("\(cache.activeCount) active")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }

                    if !cache.pending(in: room.queue).isEmpty {
                        Button {
                            Haptics.tap()
                            cache.downloadAll(room.queue)
                        } label: {
                            Image(systemName: "arrow.down.circle.dotted")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                        .help("Download every queued song to this device")
                    }

                    if !room.upNext.isEmpty {
                        Button {
                            showClearConfirm = true
                        } label: {
                            Image(systemName: "trash")
                                .font(.caption)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                        .help("Clear upcoming queue")
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .animation(.smooth(duration: 0.3), value: room.upNext)
    }

    private var libraryList: some View {
        List {
            Section {
                librarySection
            } header: {
                HStack {
                    if library.status == .authorized {
                        Menu {
                            Button("All Songs") {
                                library.selection = nil
                            }
                            ForEach(library.playlists) { playlist in
                                Button(playlist.name) {
                                    library.selection = playlist
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text(library.selection?.name ?? "All Songs")
                                    .font(.caption.weight(.semibold))
                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.caption2)
                            }
                            .foregroundStyle(.primary)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text("Apple Music")
                            .font(.caption.weight(.semibold))
                    }

                    Spacer()

                    if library.isLoading || room.isEnqueueing {
                        ProgressView().controlSize(.small)
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }

    @ViewBuilder
    private var librarySection: some View {
        switch library.status {
        case .authorized:
            if library.tracks.isEmpty && !library.isLoading {
                VStack(spacing: 8) {
                    Text("No tracks in this source")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 16)
            }

            ForEach(library.tracks) { track in
                let queued = room.isQueued(title: track.title)
                HStack(spacing: 10) {
                    if let artwork = track.artwork {
                        ArtworkImage(artwork, width: 34)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    } else {
                        ArtworkTile(url: nil, size: 34, cornerScale: 0.16)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title)
                            .font(.subheadline.weight(.medium))
                            .lineLimit(1)
                        Text(track.artist)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    Spacer(minLength: 4)

                    Button {
                        Haptics.tap()
                        Task { await room.enqueueFromAppleMusic(title: track.title, artist: track.artist, playNow: false) }
                    } label: {
                        Image(systemName: queued ? "checkmark.circle.fill" : "plus.circle")
                            .font(.body)
                            .foregroundStyle(queued ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                    }
                    .buttonStyle(.plain)
                    .help(queued ? "Already in queue" : "Add to queue")
                }
                .padding(.vertical, 2)
                .contentShape(Rectangle())
                .onTapGesture(count: 2) {
                    Haptics.tap()
                    Task { await room.enqueueFromAppleMusic(title: track.title, artist: track.artist, playNow: true) }
                }
                .disabled(room.connection != .connected)
            }

        case .notDetermined:
            VStack(spacing: 12) {
                Image(systemName: "music.note.house")
                    .font(.system(size: 36))
                    .foregroundStyle(.tint)

                Text("Connect Apple Music")
                    .font(.headline)

                Text("Browse your playlists and songs to add them straight to the room.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)

                Button("Connect Library") {
                    Task { await library.requestAuthorization() }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)

        default:
            Label("Apple Music access restricted. Enable SyncBeats under Privacy & Security › Media & Apple Music.",
                  systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.vertical, 8)
        }
    }

    // MARK: - Helpers

    private var statusColor: Color {
        switch room.connection {
        case .connected:    return room.clock.isSynced ? .green : .yellow
        case .connecting:   return .yellow
        case .disconnected: return .orange
        case .idle:         return .secondary
        }
    }

    private var transportBinding: Binding<Transport> {
        Binding(
            get: { Endpoint.transport },
            set: { newValue in
                guard newValue != Endpoint.transport else { return }
                Endpoint.transport = newValue
                room.disconnect()
                room.connect(roomId: roomId)
            }
        )
    }

    private var lanHostBinding: Binding<String> {
        Binding(
            get: { Endpoint.lanHost },
            set: { Endpoint.lanHost = $0 }
        )
    }

    private func timecode(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds)
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    private func copyToPasteboard(_ value: String) {
        Haptics.tap()
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
        #else
        UIPasteboard.general.string = value
        #endif
    }
}

// MARK: - Components

struct RoomSessionCard: View {
    let roomId: String
    let connection: ConnectionState
    let statusColor: Color
    @Binding var transport: Transport
    let onCopy: () -> Void

    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ROOM SESSION")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)

                Spacer()

                Text(connection.label)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Color.primary.opacity(0.06), in: Capsule())
            }

            HStack {
                Text(roomId)
                    .font(.system(.title3, design: .monospaced, weight: .bold))
                    .foregroundStyle(.primary)

                Spacer()

                Button {
                    onCopy()
                    copied = true
                    Task {
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        copied = false
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                            .font(.caption.weight(.semibold))
                        Text(copied ? "Copied" : "Copy")
                            .font(.caption.weight(.medium))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(copied ? Color.primary.opacity(0.15) : Color.primary.opacity(0.08), in: Capsule())
                    .foregroundStyle(.primary)
                }
                .buttonStyle(.plain)
                .help("Copy Room Code")
            }

            Menu {
                ForEach(Transport.allCases) { t in
                    Button {
                        transport = t
                    } label: {
                        Label(t.label, systemImage: t.symbol)
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: transport.symbol)
                    Text(transport.label)
                        .font(.caption.weight(.medium))
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }
}

private struct ParticipantRow: View {
    let participant: Participant
    let onVolumeChange: (Int) -> Void

    @State private var volume: Double

    init(participant: Participant, onVolumeChange: @escaping (Int) -> Void) {
        self.participant = participant
        self.onVolumeChange = onVolumeChange
        _volume = State(initialValue: Double(participant.volume))
    }

    var body: some View {
        HStack(spacing: 8) {
            AvatarBadge(name: participant.name, diameter: 26)

            VStack(alignment: .leading, spacing: 2) {
                Text(participant.name)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                if let device = participant.deviceLabel, !device.isEmpty {
                    Text(device)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)

            if let latency = participant.latencyMs {
                Text("\(Int(latency))ms")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.primary.opacity(0.05), in: Capsule())
            }
        }
        .padding(.vertical, 3)
    }
}

#if os(macOS)
struct AudioOutputsPopover: View {
    @ObservedObject private var deviceManager = DeviceManager.shared
    @ObservedObject private var audioEngine = AudioEngine.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("Audio Outputs", systemImage: "hifispeaker.2.fill")
                    .font(.headline)
                Spacer()
                Text("\(1 + deviceManager.activeSecondaryDevices.count) Active")
                    .font(.caption2.bold())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())
            }

            Divider()

            // Mac Speaker Level
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "laptopcomputer")
                        .foregroundStyle(.primary)
                    Text("Mac Audio Level")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Spacer()
                    Text("System Default")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 8) {
                    Image(systemName: "speaker.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Slider(value: Binding(
                        get: { audioEngine.mainVolume },
                        set: { audioEngine.mainVolume = $0 }
                    ))
                    Image(systemName: "speaker.wave.3.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(10)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))

            // Multi-Speaker / Bluetooth
            VStack(alignment: .leading, spacing: 8) {
                Text("Multi-Speaker Targets")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)

                let externalDevices = deviceManager.outputDevices.filter {
                    !$0.name.contains("Speaker") && !$0.name.contains("Built-in")
                }

                if externalDevices.isEmpty {
                    HStack(spacing: 8) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .foregroundStyle(.secondary)
                        Text("No external speakers found")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                } else {
                    ForEach(externalDevices) { device in
                        let isEnabled = Binding(
                            get: { deviceManager.activeSecondaryDevices.keys.contains(device.id) },
                            set: { newValue in
                                if newValue {
                                    let estimate = CalibrationService.shared.estimateCoreAudioLatency(deviceId: device.id)
                                    deviceManager.activeSecondaryDevices[device.id] = estimate
                                } else {
                                    deviceManager.activeSecondaryDevices.removeValue(forKey: device.id)
                                }
                            }
                        )

                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Toggle(isOn: isEnabled) {
                                    HStack(spacing: 6) {
                                        Image(systemName: device.name.contains("AirPods") ? "airpodspro" : "hifispeaker.fill")
                                        Text(device.name)
                                            .font(.subheadline)
                                            .lineLimit(1)
                                    }
                                }
                                .toggleStyle(.checkbox)

                                Spacer()

                                if isEnabled.wrappedValue {
                                    SpeakerSettingsButton(device: device)
                                }
                            }

                            if isEnabled.wrappedValue {
                                HStack(spacing: 8) {
                                    Image(systemName: "speaker.fill")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                    Slider(value: Binding(
                                        get: { audioEngine.getSecondaryVolume(for: device.id) },
                                        set: { audioEngine.setSecondaryVolume($0, for: device.id) }
                                    ))
                                    Image(systemName: "speaker.wave.3.fill")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                .padding(.leading, 18)
                            }
                        }
                        .padding(8)
                        .background(.regularMaterial.opacity(0.6), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                }
            }
        }
        .padding(14)
        .frame(width: 290)
    }
}

struct SpeakerSettingsButton: View {
    let device: AudioDevice
    @State private var showPopover = false

    var body: some View {
        Button {
            showPopover.toggle()
        } label: {
            Image(systemName: "gearshape")
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showPopover) {
            VStack(alignment: .leading, spacing: 12) {
                Text(device.name)
                    .font(.headline)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Volume").font(.caption).foregroundStyle(.secondary)
                    HStack {
                        Image(systemName: "speaker.fill").font(.caption2).foregroundStyle(.secondary)
                        Slider(value: Binding(
                            get: { AudioEngine.shared.getSecondaryVolume(for: device.id) },
                            set: { AudioEngine.shared.setSecondaryVolume($0, for: device.id) }
                        ))
                        Image(systemName: "speaker.wave.3.fill").font(.caption2).foregroundStyle(.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Latency Sync").font(.caption).foregroundStyle(.secondary)
                    HStack {
                        Slider(
                            value: Binding(
                                get: { DeviceManager.shared.activeSecondaryDevices[device.id] ?? 0 },
                                set: { DeviceManager.shared.activeSecondaryDevices[device.id] = $0 }
                            ),
                            in: 0...500,
                            step: 5
                        )
                        Text("\(Int(DeviceManager.shared.activeSecondaryDevices[device.id] ?? 0))ms")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                            .frame(width: 45, alignment: .trailing)
                    }

                    Button {
                        Task {
                            do {
                                let latency = try await CalibrationService.shared.calibrate(deviceId: device.id)
                                DeviceManager.shared.activeSecondaryDevices[device.id] = latency
                            } catch {
                                RoomManager.shared.lastError = error.localizedDescription
                            }
                        }
                    } label: {
                        Label("Auto-Calibrate Latency", systemImage: "wand.and.stars")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
            .padding()
            .frame(width: 260)
        }
    }
}
#endif


// MARK: - Queue Components

struct NowPlayingQueueCard: View {
    let item: QueueItem
    let isPlaying: Bool
    let durationSec: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("NOW PLAYING")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.secondary)
                .tracking(0.5)

            HStack(spacing: 10) {
                ArtworkTile(url: item.artworkURL, size: 40, cornerScale: 0.16)
                    .shadow(color: .black.opacity(0.18), radius: 4, y: 2)

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(item.artist)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 4)

                HStack(spacing: 8) {
                    LevelMeter(active: isPlaying, barHeight: 12)

                    if durationSec > 0 {
                        Text(formatDuration(durationSec))
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.035))
    }

    private func formatDuration(_ sec: Double) -> String {
        guard sec.isFinite && sec >= 0 else { return "--:--" }
        let total = Int(sec)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

struct QueueTrackRow: View {
    let index: Int
    let item: QueueItem
    let downloadState: TrackCache.State
    let onDownload: () -> Void
    let onRemove: () -> Void
    var onDropAfter: ((String) -> Void)? = nil

    @State private var isHovering = false
    @State private var isDropTargeted = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text("\(index)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.tertiary)
                    .frame(width: 18, alignment: .trailing)

                ArtworkTile(url: item.artworkURL, size: 36, cornerScale: 0.16)

                VStack(alignment: .leading, spacing: 1) {
                    Text(item.title)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                    Text(item.artist)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 4)

                if let dur = item.durationSec, dur > 0 {
                    Text(formatDuration(dur))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                DownloadBadge(state: downloadState, onTap: onDownload)

                #if os(macOS)
                if isHovering {
                    HStack(spacing: 6) {
                        Button(action: onRemove) {
                            Image(systemName: "xmark")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .padding(4)
                                .background(Color.primary.opacity(0.08), in: Circle())
                        }
                        .buttonStyle(.plain)
                        .help("Remove from queue")

                        Image(systemName: "line.3.horizontal")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .help("Drag to reorder")
                    }
                }
                #endif
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
            #if os(macOS)
            .onHover { isHovering = $0 }
            .draggable(item.id) {
                QueueDragPreview(item: item)
            }
            .dropDestination(for: String.self) { droppedIds, _ in
                guard let draggedId = droppedIds.first, draggedId != item.id else { return false }
                onDropAfter?(draggedId)
                return true
            } isTargeted: { targeted in
                withAnimation(.easeInOut(duration: 0.15)) {
                    isDropTargeted = targeted
                }
            }
            #endif

            if isDropTargeted {
                Capsule()
                    .fill(Color.accentColor)
                    .frame(height: 2)
                    .padding(.horizontal, 4)
                    .padding(.top, 2)
                    .transition(.opacity)
            }
        }
    }

    private func formatDuration(_ sec: Double) -> String {
        guard sec.isFinite && sec >= 0 else { return "--:--" }
        let total = Int(sec)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

struct QueueDragPreview: View {
    let item: QueueItem

    var body: some View {
        HStack(spacing: 10) {
            ArtworkTile(url: item.artworkURL, size: 36, cornerScale: 0.16)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(item.artist)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Image(systemName: "line.3.horizontal")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(width: 240)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.35), radius: 10, y: 5)
    }
}

struct EmptyQueueView: View {
    let onBrowseLibrary: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Spacer(minLength: 20)

            Image(systemName: "music.note.list")
                .font(.system(size: 42))
                .foregroundStyle(.tertiary)

            VStack(spacing: 4) {
                Text("Queue is Empty")
                    .font(.headline)
                Text("Search YouTube or browse your Apple Music library to add tracks to the session.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            Button(action: onBrowseLibrary) {
                Label("Browse Apple Music", systemImage: "music.note")
                    .font(.caption.weight(.medium))
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .padding(.top, 4)

            Spacer(minLength: 20)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }
}
