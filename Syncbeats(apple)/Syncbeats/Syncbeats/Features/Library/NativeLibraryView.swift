import SwiftUI

/// Native collection navigation, following the approved studio/gallery direction.
/// Design process: unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
struct NativeCollectionWorkspace: View {
    @Binding var section: NativeLibrarySection
    @Bindable var library: NativeLibraryStore
    @Bindable var room: RoomSession
    let palette: NativePalette
    let onOpenPlayer: () -> Void
    let onSave: (RoomSearchResult) -> Void

    var body: some View {
        GeometryReader { geometry in
            let wide = geometry.size.width >= 720 && geometry.size.height >= 320
            HStack(spacing: 0) {
                if wide {
                    VStack(spacing: 8) {
                        navigation(.home)
                        Rectangle().fill(palette.line).frame(width: 24, height: 1).padding(.vertical, 8)
                        ForEach(NativeLibrarySection.allCases.filter { $0 != .home }) { navigation($0) }
                        Spacer(minLength: 16)
                    }.padding(.top, 16).padding(.horizontal, 10).frame(width: 64)
                        .background(palette.panel)
                        .overlay(alignment: .trailing) { Rectangle().fill(palette.line).frame(width: 1) }
                        .accessibilityIdentifier("library-icon-rail")
                }
                VStack(spacing: 0) {
                    if !wide {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 4) { ForEach(NativeLibrarySection.allCases) { navigation($0, compact: true) } }
                                .padding(.horizontal, 16).padding(.vertical, 8)
                        }.accessibilityIdentifier("library-compact-navigation")
                        Rectangle().fill(palette.line).frame(height: 1)
                    }
                    if library.requiresServerUpdate {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "info.circle").foregroundStyle(palette.gold)
                            Text("This server needs an update for live Library sync. Showing local imports and saved collections as they load.")
                                .font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(palette.panel)
                            .accessibilityIdentifier("library-server-update-notice")
                    }
                    if section == .home {
                        VStack(spacing: 0) {
                            HStack {
                                Spacer()
                                Button { Task { await library.invalidate(); await room.loadDiscovery(.all, refresh: true) } } label: {
                                    Label("Refresh", systemImage: "arrow.clockwise").font(.system(size: 12, weight: .medium))
                                }.keyboardShortcut("r", modifiers: .command).disabled(library.managementBusy || room.isLoadingDiscovery)
                                    .help("Refresh Home and Library · ⌘R")
                            }.padding(.horizontal, 24).padding(.top, 8)
                            RoomHomeView(room: room, palette: palette, onOpenPlayer: onOpenPlayer, onSaveSong: onSave,
                                         savedSongIDs: library.savedYoutubeIDs)
                        }
                    } else { NativeLibraryPage(section: $section, library: library, room: room, palette: palette) }
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .environment(\.artworkRefreshID, library.artworkRefreshID)
    }
    private func navigation(_ target: NativeLibrarySection, compact: Bool = false) -> some View {
        NativeCollectionNavigationButton(target: target, selected: section == target,
                                         compact: compact, palette: palette) { section = target }
    }

}

/// Quiet navigation lets the album artwork carry the room's visual identity.
private struct NativeCollectionNavigationButton: View {
    let target: NativeLibrarySection
    let selected: Bool
    let compact: Bool
    let palette: NativePalette
    let select: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: select) {
            HStack(spacing: 8) {
                Image(systemName: target.symbol).font(.system(size: 16, weight: .medium)).frame(width: 20)
                if compact { Text(target.rawValue).font(.system(size: 12, weight: selected ? .semibold : .medium)) }
            }.frame(width: compact ? nil : 44, height: 44)
                .padding(.horizontal, compact ? 12 : 0)
                .foregroundStyle(selected ? palette.gold : palette.secondary)
                .background(selected || hovering ? palette.raised : .clear, in: RoundedRectangle(cornerRadius: 12))
                .overlay(alignment: compact ? .bottom : .leading) {
                    if selected {
                        Capsule().fill(palette.gold).frame(width: compact ? 16 : 2, height: compact ? 2 : 16)
                            .offset(x: compact ? 0 : -8, y: compact ? 4 : 0)
                    }
                }
        }.buttonStyle(.plain).onHover { hovering = $0 }
            .animation(.easeOut(duration: 0.12), value: hovering)
            .help(target.rawValue).accessibilityLabel(target.rawValue)
            .accessibilityIdentifier("library-nav-" + target.rawValue.lowercased())
            .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

struct NativeLibraryPage: View {
    @Binding var section: NativeLibrarySection
    @Bindable var library: NativeLibraryStore
    @Bindable var room: RoomSession
    let palette: NativePalette
    @State private var query = ""
    @State private var detailID: String?
    @State private var importing = false
    @State private var matchCandidate: NativeLibrarySong?
    @State private var playMatchedSong = false
    @State private var management: NativePlaylistSheet?
    @FocusState private var searchFocused: Bool

    var body: some View {
        GeometryReader { geometry in
            let inset: CGFloat = geometry.size.width < 600 ? 16 : 28
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Image(systemName: "magnifyingglass").foregroundStyle(palette.secondary)
                    TextField("Search your library", text: $query).textFieldStyle(.plain).font(.system(size: 14)).focused($searchFocused)
                        .accessibilityIdentifier("library-search")
                    if !query.isEmpty {
                        Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }.buttonStyle(.plain).accessibilityLabel("Clear library search")
                    } else { Text("⌘ K").font(.system(size: 11)).foregroundStyle(palette.quiet) }
                Button { Task { await library.invalidate() } } label: {
                        Label("Refresh", systemImage: "arrow.clockwise").font(.system(size: 12, weight: .medium))
                    }.keyboardShortcut("r", modifiers: .command).disabled(library.managementBusy)
                        .accessibilityLabel("Refresh Library").help("Fetch the latest collections · ⌘R")
                }.padding(12).background(palette.panel, in: RoundedRectangle(cornerRadius: 10))
                    .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(searchFocused ? palette.gold : palette.line) }
                    .padding(.horizontal, inset).padding(.vertical, 16)
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(section.rawValue).font(.system(size: 28, weight: .medium, design: .serif))
                                Text(library.loading ? "Updating…" : summary).font(.system(size: 12)).foregroundStyle(palette.secondary)
                            }
                            Spacer(minLength: 0)

                            Button { importing = true } label: {
                                Label(geometry.size.width < 600 ? "Import" : "Import Apple Music", systemImage: "apple.logo").font(.system(size: 12))
                                    .padding(10).background(palette.raised, in: RoundedRectangle(cornerRadius: 8))
                            }.accessibilityLabel("Import Apple Music").accessibilityIdentifier("library-import-apple")
                        }
                        if let error = library.error {
                            HStack(alignment: .top, spacing: 12) {
                                Text(error).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                                Button("Retry") { Task { await library.refresh() } }.disabled(library.loading)
                            }.padding(16).background(palette.panel, in: RoundedRectangle(cornerRadius: 8)).foregroundStyle(palette.error)
                        }
                        if let message = library.message {
                            Text(message).font(.system(size: 12)).foregroundStyle(palette.secondary).accessibilityAddTraits(.updatesFrequently)
                        }
                        if library.loading && library.songs.isEmpty && library.playlists.isEmpty {
                            NativeLoader(title: "Loading your library", detail: "Getting your saved playlists", palette: palette).frame(maxWidth: .infinity, minHeight: 160)
                        } else if let detail = selectedDetail {
                            Button { detailID = nil; library.closeDetail() } label: { Label("Back to " + section.rawValue.lowercased(), systemImage: "chevron.left") }.font(.system(size: 12))
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(detail.name).font(.system(size: 24, weight: .medium)).fixedSize(horizontal: false, vertical: true)
                                    Text(detail.subtitle).font(.system(size: 13)).foregroundStyle(palette.secondary)
                                }
                                Spacer(minLength: 8)
                                Button("Queue") { Task { await library.queueDetail(in: room) } }.font(.system(size: 12))
                                    .disabled(!room.canControl || library.queuing || (library.detailSongs ?? detail.songs).isEmpty).accessibilityLabel("Queue available songs from " + detail.name)
                            }
                            if section == .playlists, let playlist = library.playlists.first(where: { $0.id == detail.id }) {
                                playlistActions(playlist)
                            }
                            songList(filtered(detail.songs))
                        } else {
                            switch section {
                            case .songs: songList(filtered(library.songs).sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending })
                            case .playlists: playlistGrid
                            case .albums: groupGrid(library.albums, artists: false)
                            case .artists: groupGrid(library.artists, artists: true)
                            case .home: EmptyView()
                            }
                        }
                    if library.hasMore {
                            Button { Task { await library.loadMore() } } label: {
                                HStack { if library.loadingMore { ProgressView().controlSize(.small) }; Text("Load more") }.frame(maxWidth: .infinity).padding(12)
                            }.disabled(library.managementBusy).foregroundStyle(palette.gold)
                        }
                        if let updated = library.lastUpdated {
                            Text("Updated \(updated.formatted(date: .omitted, time: .shortened))").font(.system(size: 11)).foregroundStyle(palette.secondary)
                        }
                    }.padding(.horizontal, inset).padding(.top, 4).padding(.bottom, 28).frame(maxWidth: .infinity, alignment: .leading)
                }
            }.sheet(isPresented: $importing) {
                NativeAppleImportView(library: library, palette: palette, onClose: { importing = false })
                    .frame(width: min(640, max(340, geometry.size.width - 32)), height: min(600, max(260, geometry.size.height - 16)))
            }.sheet(item: $matchCandidate) { candidate in roomVersion(candidate) }
                .sheet(item: $management) { action in
                    NativePlaylistManagementView(action: action, library: library, palette: palette, onClose: {
                        if case .delete(let playlist) = action, !library.playlists.contains(where: { $0.id == playlist.id }) { detailID = nil }
                        management = nil
                    }).frame(width: min(620, max(340, geometry.size.width - 32)), height: min(560, max(280, geometry.size.height - 16)))
                }
        }.buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(palette.text).background(palette.background)
            .accessibilityIdentifier("native-library-" + section.rawValue.lowercased())
            .task(id: section.rawValue + "|" + query) {
                if !query.isEmpty { try? await Task.sleep(for: .milliseconds(300)) }
                guard !Task.isCancelled else { return }
                await library.open(section, query: query)
            }
            .onChange(of: section) { _, _ in detailID = nil; query = ""; library.message = nil; library.closeDetail() }
            .background { Button("Search library") { searchFocused = true }.keyboardShortcut("k", modifiers: .command).frame(width: 0, height: 0).opacity(0).accessibilityHidden(true) }
    }
    private var summary: String {
        switch section {
        case .songs: return "\(library.songs.count) saved songs"
        case .playlists: return "\(library.playlists.count) playlists in your collection"
        case .albums: return "\(library.albums.count) albums from your saved songs"
        case .artists: return "\(library.artists.count) artists in your collection"
        case .home: return ""
        }
    }
    private var selectedDetail: NativeLibraryGroup? {
        guard let detailID else { return nil }
        if section == .playlists, let playlist = library.playlists.first(where: { $0.id == detailID }) ?? library.detailPlaylist {
            return .init(id: playlist.id, name: playlist.name, subtitle: "\(playlist.displayedCount) songs · \(sourceName(playlist.source))", songs: playlist.songs)
        }
        return (section == .albums ? library.albums : library.artists).first { $0.id == detailID } ?? library.detailGroup
    }
    private func playlistActions(_ playlist: NativeLibraryPlaylist) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 16) {
                if playlist.canManage { renameButton(playlist) }
                addSongsButton(playlist)
                Spacer(minLength: 8)
                if playlist.canManage { deleteButton(playlist) }
            }
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 16) { if playlist.canManage { renameButton(playlist) }; addSongsButton(playlist) }
                if playlist.canManage { deleteButton(playlist) }
            }
        }.font(.system(size: 13)).disabled(library.managementBusy)
    }
    private func renameButton(_ playlist: NativeLibraryPlaylist) -> some View {
        Button { management = .rename(playlist) } label: { Label("Rename", systemImage: "pencil") }
            .accessibilityIdentifier("playlist-rename")
    }
    private func addSongsButton(_ playlist: NativeLibraryPlaylist) -> some View {
        Button { management = .addSongs(playlist) } label: { Label("Add songs", systemImage: "text.badge.plus") }
            .foregroundStyle(palette.gold).accessibilityIdentifier("playlist-add-songs")
    }
    private func deleteButton(_ playlist: NativeLibraryPlaylist) -> some View {
        Button(role: .destructive) { management = .delete(playlist) } label: { Label("Delete", systemImage: "trash") }
            .foregroundStyle(palette.error).accessibilityIdentifier("playlist-delete")
    }
    private func filtered(_ songs: [NativeLibrarySong]) -> [NativeLibrarySong] {
        songs.filter { query.isEmpty || [$0.title, $0.artist, $0.album ?? ""].contains { $0.localizedCaseInsensitiveContains(query) } }
    }
    @ViewBuilder private func songList(_ songs: [NativeLibrarySong]) -> some View {
        if songs.isEmpty { empty(query.isEmpty ? "No songs saved yet" : "No matching songs", detail: query.isEmpty ? "Save a song from Home, or import songs and playlists from Apple Music." : "Try another title, artist or album.") }
        else {
            LazyVStack(spacing: 4) {
                ForEach(Array(songs.enumerated()), id: \.offset) { _, song in
                    HStack(spacing: 12) {
                        DiscoveryArtwork(source: .song(song.discoveryRequest), palette: palette, radius: 6).frame(width: 44, height: 44)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(song.title).font(.system(size: 13, weight: .medium)).lineLimit(2)
                            Text(song.artist.isEmpty ? sourceName(song.source) : song.artist).font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(1)
                            if let album = song.album, !album.isEmpty { Text(album).font(.system(size: 11)).foregroundStyle(palette.quiet).lineLimit(1) }
                        }.frame(maxWidth: .infinity, alignment: .leading)
                        if let duration = song.duration { Text(playbackTime(duration)).font(.system(size: 11, design: .monospaced)).foregroundStyle(palette.quiet) }
                        Button { management = .choose(song) } label: { Image(systemName: "text.badge.plus").frame(width: 28, height: 32) }
                            .disabled(library.managementBusy || library.playlists.isEmpty).accessibilityLabel("Add " + song.title + " to a playlist")
                        Button { choose(song, play: true) } label: {
                            Image(systemName: library.matching.contains(song.id) ? "hourglass" : song.result == nil ? "link" : "play.fill").frame(width: 32, height: 32)
                        }.disabled(!room.canControl || library.matching.contains(song.id))
                            .accessibilityLabel(song.result == nil ? "Find room version for " + song.title : "Play " + song.title)
                        Button { choose(song, play: false) } label: { Image(systemName: "plus").frame(width: 28, height: 32) }
                            .disabled(!room.canControl || library.matching.contains(song.id)).accessibilityLabel("Add " + song.title + " to queue")
                    }.padding(12).background(palette.panel.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }
    private var playlistGrid: some View {
        let playlists = library.playlists.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }
        return Group {
            if playlists.isEmpty { empty(query.isEmpty ? "No playlists yet" : "No matching playlists", detail: "Your saved SyncBeats playlists and Apple Music imports appear here.") }
            else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140, maximum: 260), spacing: 20)], alignment: .leading, spacing: 24) {
                    ForEach(playlists) { playlist in
                        Button { detailID = playlist.id; Task { await library.openDetail(playlist) } } label: {
                            VStack(alignment: .leading, spacing: 12) {
                                playlistArtwork(playlist).aspectRatio(1, contentMode: .fit)
                                Text(playlist.name).font(.system(size: 14, weight: .medium)).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                                Text("\(playlist.displayedCount) songs · \(sourceName(playlist.source))").font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(1)
                            }
                        }.accessibilityLabel("Open playlist " + playlist.name)
                    }
                }
            }
        }
    }
    @ViewBuilder private func playlistArtwork(_ playlist: NativeLibraryPlaylist) -> some View {
        if let cover = playlist.artwork.flatMap(URL.init(string:)), ["https", "http"].contains(cover.scheme), cover.host != nil {
            DiscoveryArtwork(source: .song(.init(title: playlist.name, artist: nil,
                album: .init(title: playlist.name, artist: nil, suppliedURL: cover), thumbnail: playlist.artwork)), palette: palette, radius: 10)
        } else if let first = playlist.songs.first ?? playlist.preview { DiscoveryArtwork(source: .song(first.discoveryRequest), palette: palette, radius: 10) }
        else { RoundedRectangle(cornerRadius: 10).fill(palette.raised).overlay { Image(systemName: "music.note.list").font(.system(size: 28)).foregroundStyle(palette.quiet) } }
    }
    @ViewBuilder private func groupGrid(_ groups: [NativeLibraryGroup], artists: Bool) -> some View {
        let visible = groups.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.subtitle.localizedCaseInsensitiveContains(query) }
        if visible.isEmpty {
            empty(query.isEmpty ? (artists ? "No artists yet" : "No album information yet") : "No matches",
                  detail: artists ? "Artists appear when songs are saved to your collection." : "Albums appear when your saved songs have album information. Apple Music imports include it.")
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140, maximum: 260), spacing: 20)], alignment: .leading, spacing: 24) {
                ForEach(visible) { group in
                    Button { detailID = group.id; Task { await library.openDetail(group) } } label: {
                        VStack(alignment: .leading, spacing: 12) {
                            if artists, let cover = group.artworkSong, cover.discoveryRequest.album.suppliedURL != nil {
                                DiscoveryArtwork(source: .song(cover.discoveryRequest), palette: palette, radius: 10).aspectRatio(1, contentMode: .fit)
                            } else if artists { DiscoveryArtwork(source: .artist(group.name, preview: group.artworkSong?.discoveryRequest), palette: palette, radius: 10).aspectRatio(1, contentMode: .fit) }
                            else { DiscoveryArtwork(source: .album(name: group.name, artist: group.subtitle, preview: group.artworkSong?.discoveryRequest), palette: palette, radius: 10).aspectRatio(1, contentMode: .fit) }
                            Text(group.name).font(.system(size: 14, weight: .medium)).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                            Text(artists ? group.subtitle : group.subtitle + " · \(group.songs.count) songs").font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(2)
                        }
                    }.accessibilityLabel("Open " + (artists ? "artist " : "album ") + group.name)
                }
            }
        }
    }
    private func empty(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.system(size: 20, weight: .medium))
            Text(detail).font(.system(size: 13)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
            Button("Find songs in Home") { section = .home }.font(.system(size: 12)).foregroundStyle(palette.gold)
        }.padding(24).frame(maxWidth: .infinity, alignment: .leading).background(palette.panel, in: RoundedRectangle(cornerRadius: 10))
    }
    private func choose(_ song: NativeLibrarySong, play: Bool) {
        guard room.canControl else { return }
        Task {
            if let result = song.result { if play { await room.play(result) } else { await room.add(result) } }
            else {
                do { let candidate = try await library.prepareMatch(song); playMatchedSong = play; matchCandidate = candidate }
                catch { if !(error is CancellationError) { library.error = error.localizedDescription } }
            }
        }
    }
    private func roomVersion(_ candidate: NativeLibrarySong) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Choose a room version").font(.system(size: 24, weight: .medium))
            Text(candidate.title).font(.system(size: 16, weight: .medium))
            Text(candidate.artist).font(.system(size: 13)).foregroundStyle(palette.secondary)
            Text("Your Apple Music audio stays in Music. SyncBeats found a YouTube version for the shared room; check it before using it.")
                .font(.system(size: 13)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
            if let url = candidate.result.flatMap({ URL(string: $0.url) }) { Link("Open the proposed version", destination: url).font(.system(size: 13)).foregroundStyle(palette.gold) }
            HStack {
                Button("Cancel") { matchCandidate = nil }
                Spacer(minLength: 8)
                Button(playMatchedSong ? "Use & play" : "Use & queue") {
                    Task {
                        do {
                            try await library.acceptMatch(candidate)
                            matchCandidate = nil
                            if let result = candidate.result { if playMatchedSong { await room.play(result) } else { await room.add(result) } }
                        } catch { library.error = error.localizedDescription; matchCandidate = nil }
                    }
                }.foregroundStyle(palette.gold)
            }.font(.system(size: 13))
        }.padding(24).frame(width: 360).foregroundStyle(palette.text).background(palette.background).buttonStyle(NativeButtonStyle(palette: palette))
    }
    private func sourceName(_ source: String) -> String { source == "APPLE_MUSIC" ? "Apple Music" : source.hasPrefix("SPOTIFY") ? "Spotify" : "SyncBeats" }
}
