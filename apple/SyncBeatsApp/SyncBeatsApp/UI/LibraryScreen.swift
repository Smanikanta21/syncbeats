import SwiftUI

struct LibraryScreen: View {
    @StateObject private var libraryManager = LibraryManager.shared
    @StateObject private var audioPlayer = AudioPlayerManager.shared
    
    @State private var selectedTab = 0
    @State private var showingNewPlaylistAlert = false
    @State private var newPlaylistName = ""
    
    // Search State
    @State private var searchQuery = ""
    @State private var searchResults: [SearchResult] = []
    @State private var isSearching = false
    @State private var searchTask: Task<Void, Never>?
    
    var body: some View {
        NavigationView {
            VStack {
                Picker("Library", selection: $selectedTab) {
                    Text("Songs").tag(0)
                    Text("Playlists").tag(1)
                }
                .pickerStyle(SegmentedPickerStyle())
                .padding()
                
                if !searchQuery.isEmpty {
                    // Search Results
                    if isSearching {
                        Spacer()
                        ProgressView("Searching...")
                        Spacer()
                    } else if searchResults.isEmpty {
                        Spacer()
                        Text("No results found")
                            .foregroundColor(.secondary)
                        Spacer()
                    } else {
                        List(searchResults) { result in
                            LibrarySearchResultRow(result: result, audioPlayer: audioPlayer, libraryManager: libraryManager)
                        }
                        .listStyle(PlainListStyle())
                    }
                } else if selectedTab == 0 {
                    // Downloaded Songs
                    List(libraryManager.downloadedTracks) { track in
                        Button(action: {
                            audioPlayer.play(url: URL(string: track.url)!, track: track)
                        }) {
                            HStack {
                                AsyncImage(url: URL(string: track.thumbnailURL)) { phase in
                                    if let image = phase.image { image.resizable() } else { Color.gray }
                                }
                                .frame(width: 50, height: 50)
                                .cornerRadius(8)
                                
                                VStack(alignment: .leading) {
                                    Text(track.title).font(.headline)
                                    Text(track.artist).font(.subheadline).foregroundColor(.secondary)
                                }
                                Spacer()
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                            }
                        }
                        .buttonStyle(PlainButtonStyle())
                        .contextMenu {
                            Menu("Add to Playlist") {
                                if libraryManager.playlists.isEmpty {
                                    Text("No playlists available")
                                } else {
                                    ForEach(libraryManager.playlists) { playlist in
                                        Button(playlist.name) {
                                            libraryManager.addTrackToPlaylist(trackId: track.id, playlistId: playlist.id)
                                        }
                                    }
                                }
                            }
                            
                            Button(role: .destructive) {
                                libraryManager.deleteTrack(track.id)
                            } label: {
                                Label("Remove Download", systemImage: "trash")
                            }
                        }
                    }
                } else {
                    // Playlists
                    List {
                        ForEach(libraryManager.playlists) { playlist in
                            NavigationLink(destination: PlaylistDetailView(playlist: playlist)) {
                                HStack {
                                    Image(systemName: "music.note.list")
                                        .foregroundColor(.blue)
                                        .frame(width: 50, height: 50)
                                        .background(Color.blue.opacity(0.1))
                                        .cornerRadius(8)
                                    
                                    VStack(alignment: .leading) {
                                        Text(playlist.name).font(.headline)
                                        Text("\(playlist.trackIds.count) songs").font(.subheadline).foregroundColor(.secondary)
                                    }
                                }
                            }
                            .contextMenu {
                                Button(role: .destructive) {
                                    libraryManager.deletePlaylist(id: playlist.id)
                                } label: {
                                    Label("Delete Playlist", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
                
                Spacer()
            }
            .navigationTitle("Library")
            .navigationBarItems(trailing: selectedTab == 1 ? Button(action: {
                showingNewPlaylistAlert = true
            }) {
                Image(systemName: "plus")
            } : nil)
            .alert("New Playlist", isPresented: $showingNewPlaylistAlert) {
                TextField("Playlist Name", text: $newPlaylistName)
                Button("Cancel", role: .cancel) {
                    newPlaylistName = ""
                }
                Button("Create") {
                    if !newPlaylistName.isEmpty {
                        libraryManager.createPlaylist(name: newPlaylistName)
                        newPlaylistName = ""
                    }
                }
            } message: {
                Text("Enter a name for this playlist.")
            }
            // Only add searchable if it's not a dynamic island device
            .modify { view in
                if !DeviceHelper.hasDynamicIsland {
                    view.searchable(text: $searchQuery, prompt: "Search YouTube...")
                        .onChange(of: searchQuery) { newValue in
                            debounceSearch(query: newValue)
                        }
                        .onSubmit(of: .search) {
                            performSearch()
                        }
                } else {
                    view
                }
            }
        }
    }
    
    // MARK: - Search Logic
    
    private func performSearch() {
        guard !searchQuery.isEmpty else { return }
        isSearching = true
        NetworkManager.shared.search(query: searchQuery) { result in
            DispatchQueue.main.async {
                self.isSearching = false
                if case .success(let response) = result {
                    self.searchResults = response.results
                }
            }
        }
    }
    
    private func debounceSearch(query: String) {
        searchTask?.cancel()
        
        guard !query.isEmpty else {
            searchResults = []
            return
        }
        
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            
            await MainActor.run {
                performSearch()
            }
        }
    }
}

// Helper for conditional view modifiers
extension View {
    func modify<T: View>(@ViewBuilder _ modifier: (Self) -> T) -> some View {
        modifier(self)
    }
}

struct LibrarySearchResultRow: View {
    let result: SearchResult
    @ObservedObject var audioPlayer: AudioPlayerManager
    @ObservedObject var libraryManager: LibraryManager
    
    var body: some View {
        Button(action: playTrack) {
            HStack(spacing: 12) {
                // Thumbnail
                AsyncImage(url: URL(string: result.thumbnail)) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color.gray.opacity(0.2)
                    }
                }
                .frame(width: 50, height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                
                // Info
                VStack(alignment: .leading, spacing: 4) {
                    Text(result.title)
                        .font(.headline)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text(result.artist)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                
                Spacer()
                
                // Status
                let isDownloading = libraryManager.downloadingTracks.contains(result.id)
                let isDownloaded = libraryManager.downloadedTracks.contains(where: { $0.id == result.id })
                let isPlaying = audioPlayer.currentTrack?.id == result.id && audioPlayer.isPlaying
                
                if isDownloading {
                    ProgressView()
                } else if isPlaying {
                    Image(systemName: "speaker.wave.2.fill")
                        .foregroundColor(.blue)
                } else if isDownloaded {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                } else {
                    Image(systemName: "arrow.down.circle")
                        .foregroundColor(.secondary)
                }
            }
        }
        .buttonStyle(PlainButtonStyle())
        .contextMenu {
            Menu("Add to Playlist") {
                if libraryManager.playlists.isEmpty {
                    Text("No playlists available")
                } else {
                    ForEach(libraryManager.playlists) { playlist in
                        Button(playlist.name) {
                            libraryManager.addTrackToPlaylist(trackId: result.id, playlistId: playlist.id)
                        }
                    }
                }
            }
        }
    }
    
    private func playTrack() {
        let track = TrackInfo(
            id: result.id,
            title: result.title,
            artist: result.artist,
            thumbnailURL: result.thumbnail,
            duration: 0,
            url: result.audioURL
        )
        
        let isDownloaded = libraryManager.downloadedTracks.contains(where: { $0.id == result.id })
        
        if isDownloaded {
            if let url = URL(string: track.url) {
                audioPlayer.play(url: url, track: track)
            }
        } else {
            libraryManager.downloadTrack(track)
        }
    }
}

#Preview {
    LibraryScreen()
}
