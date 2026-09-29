import SwiftUI
import MusicKit

struct RoomView: View {
    let roomId: String

    @ObservedObject private var room = RoomManager.shared
    @StateObject private var library = MusicLibraryService()
    @State private var scrubProgress: Double?

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
        .alert(
            "Something went wrong",
            isPresented: Binding(get: { room.lastError != nil }, set: { if !$0 { room.lastError = nil } })
        ) {
            Button("OK", role: .cancel) { room.lastError = nil }
        } message: {
            Text(room.lastError ?? "")
        }
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        List {
            Section("Room") {
                LabeledContent("Code") {
                    Button {
                        copyToPasteboard(roomId)
                    } label: {
                        HStack(spacing: 4) {
                            Text(roomId).monospaced()
                            Image(systemName: "doc.on.doc")
                        }
                    }
                    .buttonStyle(.plain)
                    .help("Copy the room code")
                }

                LabeledContent("Status") {
                    HStack(spacing: 5) {
                        Circle().fill(statusColor).frame(width: 6, height: 6)
                        Text(room.connection.label)
                    }
                }

                Picker("Transport", selection: transportBinding) {
                    ForEach(Transport.allCases) { t in
                        Label(t.label, systemImage: t.symbol).tag(t)
                    }
                }

                if Endpoint.transport == .lan {
                    LabeledContent("Edge node") {
                        TextField("host:port", text: lanHostBinding)
                            .textFieldStyle(.roundedBorder)
                            .multilineTextAlignment(.trailing)
                    }
                }

                LabeledContent("Clock") {
                    Text(room.clock.isSynced
                         ? "±\(Int(room.clock.rttMs / 2))ms · \(Int(room.clock.offsetMs))ms skew"
                         : "Measuring…")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                }
            }

            Section("Listeners (\(room.readyCount)/\(room.participants.count) ready)") {
                if room.participants.isEmpty {
                    Text("No one connected yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(room.participants) { participant in
                        ParticipantRow(participant: participant) { room.setVolume($0, for: participant) }
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }

    // MARK: - Player

    private var player: some View {
        VStack(spacing: 0) {
            Spacer()

            ArtworkTile(url: room.currentTrack?.artworkURL, size: 280)
                .shadow(color: .black.opacity(0.28), radius: 24, y: 12)

            VStack(spacing: 5) {
                Text(room.currentTrack?.title ?? "Nothing playing")
                    .font(.title2.weight(.semibold))
                    .lineLimit(1)
                Text(room.currentTrack?.artist ?? "Queue a track to begin")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .padding(.top, 28)
            .multilineTextAlignment(.center)

            TimelineView(.periodic(from: .now, by: 0.25)) { _ in
                let live = scrubProgress ?? room.progress
                VStack(spacing: 4) {
                    Slider(
                        value: Binding(
                            get: { live },
                            set: { scrubProgress = $0 }
                        ),
                        in: 0...1,
                        onEditingChanged: { editing in
                            guard !editing, let p = scrubProgress else { return }
                            if room.durationSec > 0 { room.seek(toSeconds: p * room.durationSec) }
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
            .padding(.horizontal, 48)
            .padding(.top, 24)

            HStack(spacing: 26) {
                Button(action: room.toggleShuffle) {
                    Image(systemName: "shuffle")
                }
                .help("Shuffle")
                .foregroundStyle(room.shuffle ? Color.accentColor : .secondary)

                Button(action: room.previous) {
                    Image(systemName: "backward.fill").font(.title3)
                }
                .help("Previous")

                Button(action: room.togglePlayPause) {
                    Image(systemName: room.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 46))
                        .symbolRenderingMode(.hierarchical)
                }
                .keyboardShortcut(.space, modifiers: [])
                .help(room.isPlaying ? "Pause" : "Play")

                Button(action: room.next) {
                    Image(systemName: "forward.fill").font(.title3)
                }
                .help("Next")

                Button(action: room.cycleRepeat) {
                    Image(systemName: room.repeatMode.symbol)
                }
                .help("Repeat")
                .foregroundStyle(room.repeatMode != .off ? Color.accentColor : .secondary)
            }
            .buttonStyle(.plain)
            .padding(.top, 22)
            .disabled(room.connection != .connected)

            // The Mac is a remote until AVAudioEngine lands — say so rather than
            // leaving the user wondering why their speakers are silent.
            Label("Controls every device in the room. This Mac doesn't play audio yet.",
                  systemImage: "info.circle")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 18)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }

    // MARK: - Queue + library

    private var queueAndLibrary: some View {
        List {
            Section("Up Next") {
                if room.upNext.isEmpty {
                    Text("Nothing queued")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(room.upNext) { item in
                        TrackRow(title: item.title, subtitle: item.artist, url: item.artworkURL)
                            .contentShape(Rectangle())
                            .onTapGesture { room.jump(to: item) }
                            .contextMenu {
                                Button("Play Now") { room.jump(to: item) }
                                Button("Remove", role: .destructive) { room.remove(item) }
                            }
                    }
                }
            }

            Section {
                librarySection
            } header: {
                HStack {
                    Text("Apple Music")
                    Spacer()
                    if library.isLoading || room.isEnqueueing {
                        ProgressView().controlSize(.small)
                    }
                }
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
    }

    @ViewBuilder
    private var librarySection: some View {
        switch library.status {
        case .authorized:
            Picker("Source", selection: $library.selection) {
                Text("All Songs").tag(LibraryPlaylist?.none)
                ForEach(library.playlists) { playlist in
                    Text(playlist.name).tag(LibraryPlaylist?.some(playlist))
                }
            }
            .labelsHidden()

            if library.tracks.isEmpty && !library.isLoading {
                Text("Nothing in this source")
                    .foregroundStyle(.secondary)
            }

            ForEach(library.tracks) { track in
                Button {
                    Task { await room.enqueueFromAppleMusic(title: track.title, artist: track.artist) }
                } label: {
                    HStack(spacing: 9) {
                        if let artwork = track.artwork {
                            ArtworkImage(artwork, width: 34)
                                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                        } else {
                            ArtworkTile(url: nil, size: 34)
                        }
                        VStack(alignment: .leading, spacing: 1) {
                            Text(track.title).lineLimit(1)
                            Text(track.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "plus.circle").foregroundStyle(.secondary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(room.connection != .connected)
            }

        case .notDetermined:
            Button("Connect Apple Music") {
                Task { await library.requestAuthorization() }
            }

        default:
            Label("Access denied — enable SyncBeats under Privacy & Security › Media & Apple Music.",
                  systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(.secondary)
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
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
        #else
        UIPasteboard.general.string = value
        #endif
    }
}

// MARK: - Rows

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
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Circle()
                    .fill(participant.isReady ? Color.green : Color.orange)
                    .frame(width: 6, height: 6)
                Text(participant.name).lineLimit(1)
                Spacer(minLength: 0)
                if let latency = participant.latencyMs {
                    Text("\(Int(latency))ms")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }

            if let device = participant.deviceLabel, !device.isEmpty {
                Text(device).font(.caption2).foregroundStyle(.secondary)
            }

            Slider(value: $volume, in: 0...100, onEditingChanged: { editing in
                if !editing { onVolumeChange(Int(volume)) }
            })
            .controlSize(.mini)
        }
        .padding(.vertical, 2)
    }
}

private struct TrackRow: View {
    let title: String
    let subtitle: String
    let url: URL?

    var body: some View {
        HStack(spacing: 9) {
            ArtworkTile(url: url, size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).lineLimit(1)
                Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }
}

private struct ArtworkTile: View {
    let url: URL?
    let size: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: max(5, size * 0.05), style: .continuous)
            .fill(.quaternary)
            .overlay {
                if let url {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().aspectRatio(contentMode: .fill)
                        } else {
                            placeholder
                        }
                    }
                } else {
                    placeholder
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: max(5, size * 0.05), style: .continuous))
            .frame(width: size, height: size)
    }

    private var placeholder: some View {
        Image(systemName: "music.note")
            .font(.system(size: max(11, size * 0.28)))
            .foregroundStyle(.secondary)
    }
}
