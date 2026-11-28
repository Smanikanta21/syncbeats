import SwiftUI

enum NativePlaylistSheet: Identifiable {
    case rename(NativeLibraryPlaylist), addSongs(NativeLibraryPlaylist), delete(NativeLibraryPlaylist), choose(NativeLibrarySong)
    var id: String {
        switch self {
        case .rename(let p): "rename:" + p.id
        case .addSongs(let p): "add:" + p.id
        case .delete(let p): "delete:" + p.id
        case .choose(let s): "choose:" + s.id
        }
    }
}

/// Uses the existing studio/gallery palette and native Library spacing.
/// Design process: unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
struct NativePlaylistManagementView: View {
    let action: NativePlaylistSheet
    @Bindable var library: NativeLibraryStore
    let palette: NativePalette
    let onClose: () -> Void
    @State private var name = ""
    @State private var query = ""
    @State private var pickerSongs: [NativeLibrarySong] = []
    @State private var pickerCursor: String?
    @State private var pickerLoading = false
    @State private var pickerRevision = UUID()
    @State private var chosenSongs: [String: NativeLibrarySong] = [:]
    @State private var selection: Set<String> = []
    @State private var disposition = NativePlaylistSongDisposition.keep
    @State private var failure: String?
    @FocusState private var nameFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title).font(.system(size: 22, weight: .medium))
                    Text(subtitle).font(.system(size: 13)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Button { onClose() } label: { Image(systemName: "xmark").frame(width: 28, height: 28) }
                    .accessibilityLabel("Close playlist dialog").disabled(library.editing)
            }
            if let failure { Text(failure).font(.system(size: 13)).foregroundStyle(palette.error).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.updatesFrequently) }
            switch action {
            case .rename(let playlist):
                TextField("Playlist name", text: $name).textFieldStyle(.plain).focused($nameFocused)
                    .padding(12).background(palette.panel, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(nameFocused ? palette.gold : palette.line))
                    .accessibilityIdentifier("playlist-name-field").disabled(library.editing)
                Spacer(minLength: 0)
                footer("Save name", disabled: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.utf16.count > 120) {
                    try await library.rename(playlist, to: name)
                }
            case .addSongs(let playlist):
                songPicker(playlist)
                footer(selection.isEmpty ? "Add songs" : "Add \(selection.count) songs", disabled: selection.isEmpty) {
                    try await library.addSongs(Array(chosenSongs.values), to: playlist)
                }
            case .delete(let playlist):
                ScrollView {
                    VStack(spacing: 12) {
                        deletionChoice(.keep, title: "Delete playlist only", detail: "Keep its songs in your Library.")
                        deletionChoice(.remove, title: "Delete playlist and its songs", detail: "Remove its songs from Library. Songs used in other playlists stay.")
                    }
                }
                footer(disposition == .keep ? "Delete playlist" : "Delete playlist and songs", destructive: true) {
                    try await library.delete(playlist, songs: disposition)
                }
            case .choose(let song):
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(library.playlists) { playlist in
                            let added = playlist.songs.contains { $0.collectionKey == song.collectionKey }
                            Button {
                                perform { try await library.addSongs([song], to: playlist) }
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "music.note.list").foregroundStyle(palette.secondary)
                                    Text(playlist.name).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                                    if added { Text("Added").font(.system(size: 12)).foregroundStyle(palette.quiet) }
                                    else { Image(systemName: "plus").foregroundStyle(palette.gold) }
                                }.padding(12).background(palette.panel, in: RoundedRectangle(cornerRadius: 8))
                            }.disabled(added || library.managementBusy).accessibilityLabel(playlist.name + (added ? ", already contains song" : ", add song"))
                        }
                        if library.playlists.isEmpty { Text("Import a playlist from Apple Music to get started.").foregroundStyle(palette.secondary).padding(.vertical, 24) }
                        NativePaginationFooter(identity: action.id, cursor: library.playlistPaginationCursor,
                            loading: library.loadingMore, busy: library.managementBusy, error: library.error,
                            title: "Loading playlists", palette: palette) { await library.loadMorePlaylists() }
                    }
                }
            }
        }.padding(24).foregroundStyle(palette.text).background(palette.background)
            .buttonStyle(NativeButtonStyle(palette: palette))
            .interactiveDismissDisabled(library.editing)
            .accessibilityIdentifier("playlist-management-dialog")
            .onAppear { if case .rename(let playlist) = action { name = playlist.name; nameFocused = true } }
    }
    private var title: String {
        switch action { case .rename: "Rename playlist"; case .addSongs: "Add songs"; case .delete: "Delete playlist?"; case .choose: "Add to playlist" }
    }
    private var subtitle: String {
        switch action {
        case .rename(let p): p.name
        case .addSongs(let p): "Choose songs from Library for “\(p.name)”."
        case .delete(let p): "“\(p.name)” · \(p.displayedCount) songs"
        case .choose(let s): s.title + " · " + s.artist
        }
    }
    private func loadPicker(reset: Bool) async {
        guard !pickerLoading || reset else { return }
        let request = UUID(); pickerRevision = request
        let search = query
        failure = nil
        pickerLoading = true
        defer { if pickerRevision == request { pickerLoading = false } }
        do {
            let page = try await library.pickerPage(query: search, cursor: reset ? nil : pickerCursor)
            guard query == search, pickerRevision == request, !Task.isCancelled else { return }
            pickerSongs = reset ? page.items : NativeLibraryCollection.songs(playlists: [], imported: pickerSongs + page.items)
            pickerCursor = page.nextCursor
        } catch { if !Task.isCancelled { failure = error.localizedDescription } }
    }
    private func songPicker(_ playlist: NativeLibraryPlaylist) -> some View {
        let current = library.playlists.first { $0.id == playlist.id } ?? playlist
        let existing = Set(current.songs.map(\.collectionKey))
        let visible = pickerSongs.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || $0.artist.localizedCaseInsensitiveContains(query) }
            .sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        return VStack(spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass").foregroundStyle(palette.quiet)
                TextField("Find songs or artists", text: $query).textFieldStyle(.plain).accessibilityIdentifier("playlist-song-search")
            }.padding(12).background(palette.panel, in: RoundedRectangle(cornerRadius: 8))
            HStack {
                Text("\(selection.count) selected · up to 200").font(.system(size: 12)).foregroundStyle(palette.secondary)
                Spacer()
                Button("Clear") { selection = [] }.font(.system(size: 12)).disabled(selection.isEmpty || library.editing)
            }
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(visible) { song in
                        let added = existing.contains(song.collectionKey)
                        let checked = selection.contains(song.collectionKey)
                        Button {
                            if checked { selection.remove(song.collectionKey); chosenSongs.removeValue(forKey: song.collectionKey) } else { selection.insert(song.collectionKey); chosenSongs[song.collectionKey] = song }
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: added || checked ? "checkmark.square.fill" : "square").foregroundStyle(checked ? palette.gold : palette.quiet)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(song.title).font(.system(size: 13, weight: .medium)).lineLimit(2)
                                    Text(song.artist).font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(1)
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                if added { Text("Added").font(.system(size: 12)).foregroundStyle(palette.quiet) }
                            }.padding(12).background(palette.panel, in: RoundedRectangle(cornerRadius: 8))
                        }.disabled(added || library.editing || (!checked && selection.count >= 200))
                            .accessibilityLabel(song.title + ", " + song.artist + (added ? ", already in playlist" : ""))
                            .accessibilityAddTraits(checked || added ? .isSelected : [])
                    }
                    if visible.isEmpty { Text(query.isEmpty ? "Save songs to Library first." : "No matching songs").font(.system(size: 13)).foregroundStyle(palette.secondary).padding(.vertical, 24) }
                    NativePaginationFooter(identity: action.id + "|" + query, cursor: pickerCursor,
                        loading: pickerLoading, busy: library.editing, error: failure,
                        title: "Loading songs", palette: palette) { await loadPicker(reset: false) }
                }
            }
        }
    }
    private func deletionChoice(_ option: NativePlaylistSongDisposition, title: String, detail: String) -> some View {
        Button { disposition = option } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: disposition == option ? "largecircle.fill.circle" : "circle").foregroundStyle(disposition == option ? palette.gold : palette.quiet)
                VStack(alignment: .leading, spacing: 8) {
                    Text(title).font(.system(size: 14, weight: .medium))
                    Text(detail).font(.system(size: 13)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.padding(16).background(palette.panel, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(disposition == option ? palette.gold : palette.line))
        }.disabled(library.editing).accessibilityAddTraits(disposition == option ? .isSelected : [])
            .accessibilityIdentifier("playlist-delete-" + option.rawValue)
    }
    private func footer(_ title: String, disabled: Bool = false, destructive: Bool = false, operation: @escaping @MainActor () async throws -> Void) -> some View {
        HStack(spacing: 12) {
            Button("Cancel", action: onClose).keyboardShortcut(.cancelAction).disabled(library.editing)
            Spacer(minLength: 0)
            Button(library.editing ? "Saving…" : title, role: destructive ? .destructive : nil) { perform(operation) }
                .padding(.horizontal, 16).padding(.vertical, 10).foregroundStyle(destructive ? palette.error : palette.gold)
                .background(palette.panel, in: RoundedRectangle(cornerRadius: 8)).keyboardShortcut(.defaultAction)
                .disabled(disabled || library.managementBusy).accessibilityIdentifier("playlist-confirm")
        }.font(.system(size: 13))
    }
    private func perform(_ operation: @escaping @MainActor () async throws -> Void) {
        failure = nil
        Task {
            do { try await operation(); onClose() }
            catch { failure = error.localizedDescription }
        }
    }
}
