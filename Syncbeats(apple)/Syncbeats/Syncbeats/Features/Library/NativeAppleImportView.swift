import SwiftUI

struct NativeAppleImportView: View {
    @Bindable var library: NativeLibraryStore
    let palette: NativePalette
    let onClose: () -> Void
    @State private var preview: NativeAppleLibraryPreview?
    @State private var reading = false
    @State private var importing = false
    @State private var error: String?
    @State private var tab = "playlists"
    @State private var selectedSongs: Set<String> = []
    @State private var selectedPlaylists: Set<String> = []
    @State private var task: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Text("Import Apple Music").font(.system(size: 22, weight: .medium))
                Spacer(minLength: 0)
                Button(action: onClose) { Image(systemName: "xmark").frame(width: 28, height: 28) }.disabled(importing).accessibilityLabel("Close Apple Music import")
            }
            Text("Save song details, artwork, and playlists to your SyncBeats account. They will appear on the web and your other devices. Audio files are not uploaded.")
                .font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("apple-import-local-storage-note")
            if importing, let progress = library.importProgress {
                Text(progress).font(.system(size: 12)).foregroundStyle(palette.secondary).accessibilityAddTraits(.updatesFrequently)
            }
            if let error { Text(error).font(.system(size: 12)).foregroundStyle(palette.error).fixedSize(horizontal: false, vertical: true) }
            if reading {
                NativeLoader(title: "Reading Apple Music", detail: "Getting your songs and playlists", palette: palette).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let preview {
                Picker("Choose what to import", selection: $tab) { Text("Playlists").tag("playlists"); Text("Songs").tag("songs") }.pickerStyle(.segmented)
                HStack {
                    Text("\(selectionCount(preview)) songs selected").font(.system(size: 12)).foregroundStyle(palette.secondary)
                    Spacer()
                    Button(allSelected(preview) ? "Clear selection" : "Select all") { selectAll(preview) }.font(.system(size: 12))
                }
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        if tab == "playlists" {
                            ForEach(preview.playlists) { playlist in
                                selectionRow(playlist.name, detail: "\(playlist.songs.count) songs", selected: selectedPlaylists.contains(playlist.id)) { toggle(playlist.id, in: &selectedPlaylists) }
                            }
                            if preview.playlists.isEmpty { Text("No readable playlists in your Apple Music library").font(.system(size: 13)).foregroundStyle(palette.secondary) }
                        } else {
                            ForEach(preview.songs) { song in
                                selectionRow(song.title, detail: song.artist, selected: selectedSongs.contains(song.id)) { toggle(song.id, in: &selectedSongs) }
                            }
                            if preview.songs.isEmpty { Text("Your Apple Music library has no songs yet").font(.system(size: 13)).foregroundStyle(palette.secondary) }
                        }
                        if !preview.failedPlaylists.isEmpty {
                            Text("Couldn't read \(preview.failedPlaylists.count) playlists: " + preview.failedPlaylists.joined(separator: ", "))
                                .font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                            Button("Read library again", action: read).font(.system(size: 12))
                        }
                        if preview.skippedVideos > 0 { Text("\(preview.skippedVideos) music videos were skipped").font(.system(size: 12)).foregroundStyle(palette.secondary) }
                    }
                }
                Text("Copies names, artwork and playlist order to this Mac. Audio stays in Apple Music; songs need a room version before sharing. Re-importing updates your collection without duplicating songs.")
                    .font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                HStack {
                    Button("Cancel", action: onClose).disabled(importing)
                    Spacer()
                    Button(importing ? "Saving…" : "Save to account") { commit(preview) }
                        .disabled(importing || (selectedSongs.isEmpty && selectedPlaylists.isEmpty)).foregroundStyle(palette.gold)
                        .accessibilityIdentifier("apple-import-selection")
                }.font(.system(size: 13))
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text("Bring your collection into SyncBeats").font(.system(size: 19, weight: .medium))
                        Text("Choose songs or playlists from your Apple Music library. You'll review the selection before anything is imported.")
                            .font(.system(size: 14)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                        Text("Song details and playlists are saved to your SyncBeats account, so they're available on the web and your other devices. Audio files aren't uploaded.")
                            .font(.system(size: 13)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                        Button("Choose from Apple Music", action: read).font(.system(size: 13, weight: .medium)).foregroundStyle(palette.gold)
                            .accessibilityIdentifier("apple-import-authorize")
                    }.padding(.vertical, 12)
                }.frame(maxHeight: .infinity)
            }
        }.padding(20).foregroundStyle(palette.text).background(palette.background).buttonStyle(NativeButtonStyle(palette: palette))
            .interactiveDismissDisabled(importing).onDisappear { task?.cancel() }
    }
    private func read() {
        guard !reading else { return }
        reading = true; error = nil
        task = Task {
            do {
                let result = try await AppleMusicLibraryImport.read()
                guard !Task.isCancelled else { return }
                preview = result; selectedSongs = []; selectedPlaylists = []
            } catch { if !Task.isCancelled { self.error = error.localizedDescription } }
            if !Task.isCancelled { reading = false }
        }
    }
    private func commit(_ preview: NativeAppleLibraryPreview) {
        guard !importing else { return }
        importing = true; error = nil
        task = Task {
            do {
                try await library.importSelection(songs: preview.songs.filter { selectedSongs.contains($0.id) }, playlists: preview.playlists.filter { selectedPlaylists.contains($0.id) })
                onClose()
            } catch { self.error = error.localizedDescription; importing = false }
        }
    }
    private func selectionRow(_ name: String, detail: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: selected ? "checkmark.square.fill" : "square").foregroundStyle(selected ? palette.gold : palette.quiet)
                VStack(alignment: .leading, spacing: 4) {
                    Text(name).font(.system(size: 13)).lineLimit(2)
                    Text(detail).font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(1)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.padding(12).background(selected ? palette.raised : palette.panel, in: RoundedRectangle(cornerRadius: 8))
        }.accessibilityLabel((selected ? "Deselect " : "Select ") + name).accessibilityAddTraits(selected ? .isSelected : [])
    }
    private func toggle(_ id: String, in selection: inout Set<String>) { if selection.contains(id) { selection.remove(id) } else { selection.insert(id) } }
    private func selectionCount(_ preview: NativeAppleLibraryPreview) -> Int {
        Set(preview.songs.filter { selectedSongs.contains($0.id) }.map(\.id) + preview.playlists.filter { selectedPlaylists.contains($0.id) }.flatMap { $0.songs.map(\.id) }).count
    }
    private func allSelected(_ preview: NativeAppleLibraryPreview) -> Bool {
        tab == "songs" ? !preview.songs.isEmpty && selectedSongs.count == preview.songs.count : !preview.playlists.isEmpty && selectedPlaylists.count == preview.playlists.count
    }
    private func selectAll(_ preview: NativeAppleLibraryPreview) {
        let clear = allSelected(preview)
        if tab == "songs" { selectedSongs = clear ? [] : Set(preview.songs.map(\.id)) }
        else { selectedPlaylists = clear ? [] : Set(preview.playlists.map(\.id)) }
    }
}
