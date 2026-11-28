import SwiftUI
#if os(iOS)
import UIKit
#endif

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
                    ZStack {
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
                        } else {
                            NativeLibraryPage(section: $section, library: library, room: room, palette: palette)
                        }
                    }.nativePageTransition(value: section)
                        .clipped()
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
    @State private var selectedSongID: String?
    @AppStorage("native-library-song-layout") private var songLayout = "list"
    @AppStorage("native-library-collection-layout") private var collectionLayout = "gallery"
    @State private var detailID: String?
    @State private var importing = false
    @State private var management: NativePlaylistSheet?
    @FocusState private var searchFocused: Bool

    var body: some View {
        GeometryReader { geometry in
            let narrow = geometry.size.width < 480
            let inset: CGFloat = geometry.size.width < 600 ? 16 : 24
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Image(systemName: "magnifyingglass").foregroundStyle(palette.secondary)
                    TextField("Search your library", text: $query).textFieldStyle(.plain).font(.system(size: 14)).focused($searchFocused)
                        .accessibilityIdentifier("library-search")
                    if !query.isEmpty {
                        Button { query = "" } label: { Image(systemName: "xmark.circle.fill").frame(minWidth: 44, minHeight: 44) }.buttonStyle(.plain).accessibilityLabel("Clear library search")
                    }
                    #if os(macOS)
                    if query.isEmpty { Text("⌘ K").font(.system(size: 11)).foregroundStyle(palette.quiet) }
                    #endif
                Button { Task { await library.invalidate() } } label: {
                        Group {
                            if narrow { Image(systemName: "arrow.clockwise") }
                            else { Label("Refresh", systemImage: "arrow.clockwise") }
                        }.font(.system(size: 12, weight: .medium)).frame(minWidth: 44, minHeight: 44)
                    }.keyboardShortcut("r", modifiers: .command).disabled(library.managementBusy)
                        .accessibilityLabel("Refresh Library").help("Fetch the latest collections · ⌘R")
                }.padding(.horizontal, 12).padding(.vertical, 4).background(palette.panel, in: RoundedRectangle(cornerRadius: 12))
                    .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(searchFocused ? palette.gold : palette.line) }
                    .padding(.horizontal, inset).padding(.vertical, 16)
                HStack(spacing: 12) {
                    if detailID != nil {
                        Button(action: goBack) {
                            Group {
                                if narrow { Image(systemName: "chevron.left") }
                                else { Label("Back", systemImage: "chevron.left") }
                            }.frame(minWidth: 44, minHeight: 44)
                        }.accessibilityLabel("Back to \(section.rawValue)")
                            .buttonStyle(NativeButtonStyle(palette: palette))
                            .background(palette.raised, in: RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(palette.line, lineWidth: 1))
                            .keyboardShortcut("[", modifiers: .command)
                            .help("Back to \(section.rawValue) · ⌘[")
                            .accessibilityIdentifier("library-back")
                    }
                    Text(section.rawValue)
                        .font(.system(size: 18, weight: .semibold)).lineLimit(1)
                    Spacer(minLength: 8)
                    if supportsGallery {
                        Picker("View", selection: layoutBinding) {
                            Label("List", systemImage: "list.bullet").tag("list")
                            Label("Gallery", systemImage: "square.grid.2x2").tag("gallery")
                        }.pickerStyle(.segmented).frame(width: narrow ? 136 : 176)
                            .accessibilityIdentifier("library-layout")
                    }
                }.padding(.horizontal, inset).padding(.bottom, 16)
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
                        if let playbackError = room.errorMessage {
                            Text(playbackError).font(.system(size: 12)).foregroundStyle(palette.error)
                                .fixedSize(horizontal: false, vertical: true)
                        } else if let playbackStatus = room.statusMessage {
                            Text(playbackStatus).font(.system(size: 12)).foregroundStyle(palette.secondary)
                                .accessibilityAddTraits(.updatesFrequently)
                        }
                        if library.loading && library.songs.isEmpty && library.playlists.isEmpty {
                            NativeLoader(title: "Loading your library", detail: "Getting your saved playlists", palette: palette).frame(maxWidth: .infinity, minHeight: 160)
                        } else if let detail = selectedDetail {
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
                            songList(filtered(library.detailSongs ?? detail.songs))
                        } else {
                            switch section {
                            case .songs: songList(filtered(library.songs).sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending })
                            case .playlists: playlistGrid
                            case .albums: groupGrid(library.albums, artists: false)
                            case .artists: groupGrid(library.artists, artists: true)
                            case .home: EmptyView()
                            }
                        }
                        paginationFooter
                        if let updated = library.lastUpdated {
                            Text("Updated \(updated.formatted(date: .omitted, time: .shortened))").font(.system(size: 11)).foregroundStyle(palette.secondary)
                        }
                    }.padding(.horizontal, inset).padding(.top, 4).padding(.bottom, 28).frame(maxWidth: .infinity, alignment: .leading)
                        .nativePageTransition(value: detailID)
                }
                .scrollDismissesKeyboard(.interactively)
                .refreshable { await library.refresh() }
            }.sheet(isPresented: $importing) {
                NativeAppleImportView(library: library, palette: palette, onClose: { importing = false })
                    .frame(width: min(640, max(340, geometry.size.width - 32)), height: min(600, max(260, geometry.size.height - 16)))
            }
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
            #if os(iOS)
            .simultaneousGesture(DragGesture(minimumDistance: 20, coordinateSpace: .local).onEnded { value in
                guard detailID != nil else { return }
                if PlayerGestures.goesBack(startX: value.startLocation.x, translation: value.translation,
                                          predicted: value.predictedEndTranslation) { goBack() }
            })
            #endif
            .onChange(of: section) { _, _ in selectedSongID = nil; detailID = nil; query = ""; library.message = nil; library.closeDetail() }
            .background { Button("Search library") { searchFocused = true }.keyboardShortcut("k", modifiers: .command).frame(width: 0, height: 0).opacity(0).accessibilityHidden(true) }
    }
    private var displaysSongs: Bool { detailID != nil || section == .songs }
    @ViewBuilder private var paginationFooter: some View {
        if library.hasMore || library.loadingMore {
            NativePaginationFooter(identity: "\(section.rawValue)|\(query)|\(detailID ?? "")",
                cursor: library.hasMore ? library.paginationCursor : nil, loading: library.loadingMore,
                busy: library.managementBusy, error: library.error, title: "Loading more music", palette: palette) {
                    await library.loadMore()
                }
        }
    }
    private var layout: NativeLibraryLayout {
        guard supportsGallery else { return .list }
        return NativeLibraryLayout(rawValue: displaysSongs ? songLayout : collectionLayout) ?? (displaysSongs ? .list : .gallery)
    }
    private var supportsGallery: Bool {
        #if os(iOS)
        UIDevice.current.userInterfaceIdiom != .phone
        #else
        true
        #endif
    }
    private var layoutBinding: Binding<String> {
        Binding(get: { layout.rawValue }, set: { if displaysSongs { songLayout = $0 } else { collectionLayout = $0 } })
    }
    private func goBack() {
        detailID = nil
        selectedSongID = nil
        library.closeDetail()
    }
    @ViewBuilder private func itemsLayout<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if layout == .gallery {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 200, maximum: 280), spacing: 18)], alignment: .leading, spacing: 18, content: content)
        } else {
            LazyVStack(spacing: 10, content: content)
        }
    }
    private var summary: String {
        switch section {
        case .songs:
            if let total = library.catalogTotal { return "\(total) \(query.isEmpty ? "saved" : "matching") songs" }
            return library.hasMore ? "\(library.songs.count) songs loaded" : "\(library.songs.count) saved songs"
        case .playlists:
            return library.hasMorePlaylists ? "\(library.playlists.count) playlists loaded" : "\(library.playlists.count) playlists in your collection"
        case .albums:
            if let total = library.catalogTotal { return "\(total) albums from your saved songs" }
            return library.hasMore ? "\(library.albums.count) albums loaded" : "\(library.albums.count) albums from your saved songs"
        case .artists:
            if let total = library.catalogTotal { return "\(total) artists in your collection" }
            return library.hasMore ? "\(library.artists.count) artists loaded" : "\(library.artists.count) artists in your collection"
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
    private var playbackSongs: [NativeLibrarySong] {
        let values = filtered(library.detailSongs ?? selectedDetail?.songs ?? library.songs)
        return detailID == nil && section == .songs ? values.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending } : values
    }
    @ViewBuilder private func songList(_ songs: [NativeLibrarySong]) -> some View {
        if songs.isEmpty { empty(query.isEmpty ? "No songs saved yet" : "No matching songs", detail: query.isEmpty ? "Save a song from Home, or import songs and playlists from Apple Music." : "Try another title, artist or album.") }
        else {
            itemsLayout {
                ForEach(songs) { song in
                    NativeLibrarySongRow(song: song, palette: palette, layout: layout, selected: selectedSongID == song.id,
                                         canPlay: room.canControl && !room.preparingLibraryPlayback && !library.matching.contains(song.id),
                                         select: { selectedSongID = song.id },
                                         play: { selectedSongID = song.id; choose(song, play: true) }) {
                        Button { management = .choose(song) } label: { Image(systemName: "text.badge.plus").frame(width: 28, height: 32) }
                            .disabled(library.managementBusy || library.playlists.isEmpty).accessibilityLabel("Add " + song.title + " to a playlist")
                        Button { choose(song, play: true) } label: {
                            Image(systemName: library.matching.contains(song.id) ? "hourglass" : song.result == nil ? "link" : "play.fill").frame(width: 32, height: 32)
                        }.disabled(!room.canControl || library.matching.contains(song.id))
                            .accessibilityLabel(song.result == nil ? "Find room version for " + song.title : "Play " + song.title)
                        Button { choose(song, play: false) } label: { Image(systemName: "plus").frame(width: 28, height: 32) }
                            .disabled(!room.canControl || library.matching.contains(song.id)).accessibilityLabel("Add " + song.title + " to queue")
                    }
                }
            }
        }
    }
    private var playlistGrid: some View {
        let playlists = library.playlists.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }
        return Group {
            if playlists.isEmpty { empty(query.isEmpty ? "No playlists yet" : "No matching playlists", detail: "Your saved SyncBeats playlists and Apple Music imports appear here.") }
            else {
                itemsLayout {
                    ForEach(playlists) { playlist in
                        Button { detailID = playlist.id; Task { await library.openDetail(playlist) } } label: {
                            NativeLibraryCollectionLabel(title: playlist.name,
                                subtitle: "\(playlist.displayedCount) songs · \(sourceName(playlist.source))",
                                layout: layout, palette: palette) { playlistArtwork(playlist) }
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
            itemsLayout {
                ForEach(visible) { group in
                    Button { detailID = group.id; Task { await library.openDetail(group) } } label: {
                        NativeLibraryCollectionLabel(title: group.name,
                            subtitle: artists ? group.subtitle : group.subtitle + " · \(group.total ?? group.songs.count) songs",
                            layout: layout, palette: palette) {
                            if artists, let cover = group.artworkSong, cover.discoveryRequest.album.suppliedURL != nil {
                                DiscoveryArtwork(source: .song(cover.discoveryRequest), palette: palette, radius: 10)
                            } else if artists {
                                DiscoveryArtwork(source: .artist(group.name, preview: group.artworkSong?.discoveryRequest), palette: palette, radius: 10)
                            } else {
                                DiscoveryArtwork(source: .album(name: group.name, artist: group.subtitle, preview: group.artworkSong?.discoveryRequest), palette: palette, radius: 10)
                            }
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
        let context = playbackSongs
        guard room.canControl, !room.preparingLibraryPlayback, !library.matching.contains(song.id) else { return }
        Task {
            do {
                let candidate = try await library.resolveForPlayback(song)
                guard let result = candidate.result else { throw AuthFailure.invalidResponse }
                if play {
                    await room.playLibrary(candidate, in: context,
                                           resolve: { try await library.resolveForPlayback($0) })
                } else { await room.add(result) }
            } catch {
                if !(error is CancellationError) { library.error = error.localizedDescription }
            }
        }
    }
    private func sourceName(_ source: String) -> String { source == "APPLE_MUSIC" ? "Apple Music" : source.hasPrefix("SPOTIFY") ? "Spotify" : "SyncBeats" }
}
