import SwiftUI

struct RoomHomeView: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    var onOpenPlayer: () -> Void
    var onSaveSong: ((RoomSearchResult) -> Void)? = nil
    var savedSongIDs: Set<String> = []
    @State private var genre = DiscoveryGenre.all
    @State private var didSearch = false
    @State private var submittedQuery = ""
    @FocusState private var searchFocused: Bool

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
            searchField.padding(.horizontal, geometry.size.width < 600 ? 16 : 28).padding(.vertical, 16)
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if didSearch { searchResults } else { discoveryFeed(compact: geometry.size.height < 480) }
                }.padding(.horizontal, geometry.size.width < 600 ? 16 : 28).padding(.top, 4).padding(.bottom, 28)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            #if os(iOS)
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await room.loadMusicInterests(); await room.loadListeningHistory(); await room.loadDiscovery(.all, refresh: true) }
            #endif
        }
        }
        .task(id: room.roomID) { if room.musicFeed == nil { await room.loadMusicInterests() } }
        .task(id: room.roomID) { await room.loadListeningHistory() }
        .onChange(of: room.searchQuery) { _, value in if value.isEmpty { didSearch = false } }
        .background {
            Button("Find music") { searchFocused = true }.keyboardShortcut("k", modifiers: .command)
                .frame(width: 0, height: 0).opacity(0).accessibilityHidden(true)
        }
    }

    private var searchField: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass").foregroundStyle(palette.secondary)
            TextField("Search songs or artists", text: $room.searchQuery).textFieldStyle(.plain)
                .font(.system(size: 14)).focused($searchFocused).onSubmit(runSearch)
                .accessibilityLabel("Search songs or artists")
            if !room.searchQuery.isEmpty {
                Button { room.searchQuery = ""; didSearch = false; searchFocused = true } label: { Image(systemName: "xmark.circle.fill") }
                    .buttonStyle(.plain).foregroundStyle(palette.quiet).accessibilityLabel("Clear search")
            } else {
                #if os(macOS)
                Text("⌘ K").font(.system(size: 11)).foregroundStyle(palette.quiet)
                #endif
            }
            Button(room.isSearching ? "Searching…" : "Search", action: runSearch)
                .font(.system(size: 12, weight: .medium)).buttonStyle(NativeButtonStyle(palette: palette))
                .disabled(room.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || room.isSearching || !room.canControl)
        }.padding(12).background(palette.panel, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(searchFocused ? palette.gold : palette.line))
    }

    private func discoveryFeed(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: compact ? 16 : 28) {
            VStack(alignment: .leading, spacing: 8) {
                if !compact { Text("Music discovery").font(.system(size: 12)).foregroundStyle(palette.gold) }
                Text("For your room").font(.system(size: compact ? 28 : 32, weight: .medium, design: .serif))
                if !compact { Text("Find the next track. Keep everyone listening together.").font(.system(size: 14)).foregroundStyle(palette.secondary) }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(DiscoveryGenre.allCases) { option in
                        Button(option.rawValue) { genre = option; room.searchQuery = option.query; runSearch() }.font(.system(size: 12))
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(genre == option ? palette.raised : .clear, in: Capsule())
                            .buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(genre == option ? palette.text : palette.secondary)
                            .accessibilityAddTraits(genre == option ? .isSelected : [])
                    }
                }
            }
            if !compact, let current = room.currentTrack {
                Button(action: onOpenPlayer) {
                    HStack(spacing: 18) {
                        DiscoveryArtwork(source: .song(current.discoveryArtworkRequest), palette: palette, radius: 8).frame(width: 84, height: 84)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(room.pendingPlay ? "Preparing playback" : room.isPlaying ? "Playing in your room" : "On the turntable").font(.system(size: 12)).foregroundStyle(palette.gold)
                            Text(current.title).font(.system(size: 19, weight: .medium)).lineLimit(2)
                            Text(current.artistLabel).font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(1)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "arrow.up.right").foregroundStyle(palette.quiet)
                    }.padding(18).background(palette.panel, in: RoundedRectangle(cornerRadius: 12))
                }.buttonStyle(NativeButtonStyle(palette: palette)).accessibilityLabel("Open player for \(current.title)")
            }
            MusicInterestsView(room: room, palette: palette) { query in
                room.searchQuery = query; runSearch()
            }
            if !room.listeningHistory.isEmpty || room.isLoadingHistory || room.historyError != nil {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Recently played").font(.system(size: 21, weight: .medium, design: .serif))
                    if room.isLoadingHistory { NativeLoader(title: "Loading your history", palette: palette, compact: true) }
                    else if let error = room.historyError { retryState(error) { await room.loadListeningHistory() } }
                    else {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 12)], spacing: 12) {
                            ForEach(Array(room.listeningHistory.prefix(6))) { result in recentRow(result) }
                        }
                    }
                }
            }
            if !room.recentRoomTracks.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Played in this room").font(.system(size: 21, weight: .medium, design: .serif))
                    ForEach(room.recentRoomTracks) { track in
                        HStack(spacing: 12) {
                            DiscoveryArtwork(source: .song(track.discoveryArtworkRequest), palette: palette, radius: 6).frame(width: 38, height: 38)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(track.title).font(.system(size: 13, weight: .medium)).lineLimit(1)
                                Text(track.artistLabel).font(.system(size: 11)).foregroundStyle(palette.quiet)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            if room.queue.contains(where: { $0.id == track.id }) {
                                Button { room.jump(to: track) } label: { Image(systemName: "play.fill").frame(width: 30, height: 30) }
                                    .buttonStyle(NativeButtonStyle(palette: palette)).disabled(!room.canControl).accessibilityLabel("Play \(track.title) again")
                            }
                        }
                    }
                }
            }
            Text("This Mac plays audio with the connected devices.").font(.system(size: 12)).foregroundStyle(palette.quiet)
        }
    }

    private func musicGrid(_ tracks: [RoomSearchResult], compact: Bool = false) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: compact ? 130 : 150, maximum: compact ? 180 : 250), spacing: 18)], alignment: .leading, spacing: 24) {
            ForEach(tracks) { result in
                RoomDiscoveryCard(result: result, room: room, palette: palette, onSaveSong: onSaveSong,
                                  saved: YouTubeIdentity.id(in: result.url).map { savedSongIDs.contains($0) } ?? false)
            }
        }
    }
    private func recentRow(_ result: RoomSearchResult) -> some View {
        HStack(spacing: 12) {
            DiscoveryArtwork(source: .song(result.discoveryArtworkRequest), palette: palette, radius: 6).frame(width: 42, height: 42)
            VStack(alignment: .leading, spacing: 4) {
                Text(result.title).font(.system(size: 13, weight: .medium)).lineLimit(1)
                Text(result.uploaderName ?? "YouTube").font(.system(size: 11)).foregroundStyle(palette.quiet).lineLimit(1)
            }.frame(maxWidth: .infinity, alignment: .leading)
            Button { Task { await room.play(result, in: room.listeningHistory) } } label: { Image(systemName: "play.fill").frame(width: 30, height: 30) }
                .buttonStyle(NativeButtonStyle(palette: palette)).disabled(!room.canControl || room.addingURLs.contains(result.url))
                .accessibilityLabel("Play \(result.title) again")
        }.padding(12).background(palette.panel, in: RoundedRectangle(cornerRadius: 8))
    }
    private var searchResults: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack {
                Text("Results for “\(submittedQuery)”").font(.system(size: 24, weight: .medium, design: .serif)).lineLimit(2)
                Spacer()
                Button("Back to home") { room.searchQuery = ""; didSearch = false }.buttonStyle(NativeButtonStyle(palette: palette))
            }
            if room.isSearching { NativeLoader(title: "Finding your track", detail: "Searching songs and artists", palette: palette).frame(maxWidth: .infinity, minHeight: 200) }
            else if room.searchResults.isEmpty { emptyState("No matches yet", detail: "Try another song title or artist.") }
            else { musicGrid(room.searchResults) }
        }
    }
    private func emptyState(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.system(size: 19, weight: .medium))
            Text(detail).font(.system(size: 13)).foregroundStyle(palette.secondary)
            Button("Find music") { searchFocused = true }.buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(palette.gold)
        }.padding(24).frame(maxWidth: .infinity, alignment: .leading).background(palette.panel, in: RoundedRectangle(cornerRadius: 10))
    }
    private func retryState(_ message: String, action: @escaping () async -> Void) -> some View {
        HStack(spacing: 16) {
            Text(message).font(.system(size: 13)).foregroundStyle(palette.secondary).frame(maxWidth: .infinity, alignment: .leading)
            Button("Retry") { Task { await action() } }.buttonStyle(NativeButtonStyle(palette: palette))
        }.padding(20).background(palette.panel, in: RoundedRectangle(cornerRadius: 10))
    }
    private func runSearch() {
        guard room.canControl, !room.isSearching, !room.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        submittedQuery = room.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        didSearch = true
        Task { await room.search() }
    }
}

private struct RoomDiscoveryCard: View {
    let result: RoomSearchResult
    @Bindable var room: RoomSession
    let palette: NativePalette
    var onSaveSong: ((RoomSearchResult) -> Void)? = nil
    var saved = false
    private var queued: Bool { room.queuedTrack(for: result) != nil }
    private var adding: Bool { room.addingURLs.contains(result.url) }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { Task { await room.play(result, in: room.searchResults) } } label: {
                DiscoveryArtwork(source: .song(result.discoveryArtworkRequest), palette: palette, radius: 8).aspectRatio(1, contentMode: .fit)
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "play.fill").font(.system(size: 12)).padding(10)
                            .foregroundStyle(palette.buttonText).background(palette.gold, in: Circle()).padding(10)
                    }
            }.buttonStyle(NativeButtonStyle(palette: palette)).disabled(!room.canControl || adding).accessibilityLabel("Play \(result.title) in the room")
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(result.title).font(.system(size: 13, weight: .medium)).lineLimit(2).frame(height: 36, alignment: .topLeading)
                    Text(result.uploaderName ?? "YouTube").font(.system(size: 12)).foregroundStyle(palette.quiet).lineLimit(1)
                    Text(result.duration.map { playbackTime($0) + " · YouTube" } ?? "YouTube").font(.system(size: 10)).foregroundStyle(palette.quiet)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Button { Task { await room.add(result) } } label: {
                    Image(systemName: adding ? "hourglass" : queued ? "checkmark" : "plus").font(.system(size: 12)).frame(width: 28, height: 28)
                }.buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(palette.gold).disabled(!room.canControl || queued || adding)
                    .accessibilityLabel(queued ? "Already queued: \(result.title)" : "Add \(result.title) to queue")
            }
            if let onSaveSong {
                Button { onSaveSong(result) } label: { Label(saved ? "Saved" : "Save to Library", systemImage: saved ? "bookmark.fill" : "bookmark") }
                    .font(.system(size: 12)).foregroundStyle(palette.secondary).buttonStyle(NativeButtonStyle(palette: palette))
                    .disabled(saved).accessibilityLabel(saved ? "Saved in Library: \(result.title)" : "Save \(result.title) to Library")
            }
        }
    }
}
