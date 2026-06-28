import SwiftUI

/// Search tab inside the expanded Dynamic Island
struct IslandSearchView: View {
    @State private var searchQuery = ""
    @State private var searchResults: [SearchResult] = []
    @State private var isSearching = false
    @State private var searchTask: Task<Void, Never>?
    @ObservedObject var audioPlayer: AudioPlayerManager
    
    var body: some View {
        VStack(spacing: 12) {
            // Search bar
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.4))
                
                TextField("Search tracks...", text: $searchQuery)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
                    .tint(.white)
                    .onChange(of: searchQuery, perform: { newValue in
                        debounceSearch(query: newValue)
                    })
                    .onSubmit { performSearch() }
                
                if !searchQuery.isEmpty {
                    Button(action: { searchQuery = ""; searchResults = [] }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.3))
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            
            // Results
            if isSearching {
                HStack(spacing: 8) {
                    ProgressView()
                        .tint(.white.opacity(0.5))
                        .scaleEffect(0.8)
                    Text("Searching...")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if searchResults.isEmpty && !searchQuery.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "music.note.list")
                        .font(.system(size: 24))
                        .foregroundColor(.white.opacity(0.2))
                    Text("No results found")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.4))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if searchResults.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "waveform")
                        .font(.system(size: 24))
                        .foregroundColor(.white.opacity(0.15))
                    Text("Search YouTube for tracks")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.3))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 4) {
                        ForEach(searchResults) { result in
                            SearchResultRow(result: result, audioPlayer: audioPlayer)
                        }
                    }
                }
            }
        }
    }
    
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
            try? await Task.sleep(nanoseconds: 200_000_000)
            guard !Task.isCancelled else { return }
            
            await MainActor.run {
                performSearch()
            }
        }
    }
}

struct SearchResultRow: View {
    let result: SearchResult
    @ObservedObject var audioPlayer: AudioPlayerManager
    @ObservedObject var libraryManager = LibraryManager.shared
    
    var body: some View {
        Button(action: playTrack) {
            HStack(spacing: 10) {
                // Thumbnail
                AsyncImage(url: URL(string: result.thumbnail)) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color.white.opacity(0.1)
                    }
                }
                .frame(width: 40, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                
                // Info
                VStack(alignment: .leading, spacing: 2) {
                    Text(result.title)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text(result.artist)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
                // Duration
                Text(result.duration)
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.white.opacity(0.4))
                
                // Play icon / Progress
                let isDownloading = libraryManager.downloadingTracks.contains(result.id)
                let isDownloaded = libraryManager.downloadedTracks.contains(where: { $0.id == result.id })
                let isPlaying = audioPlayer.currentTrack?.id == result.id && audioPlayer.isPlaying
                
                if isDownloading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.8)
                } else if isPlaying {
                    Image(systemName: "pause.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.white)
                } else if isDownloaded {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.green.opacity(0.8))
                } else {
                    Image(systemName: "arrow.down.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(PlainButtonStyle())
        .contextMenu {
            Menu("Add to Playlist") {
                if LibraryManager.shared.playlists.isEmpty {
                    Text("No playlists available")
                } else {
                    ForEach(LibraryManager.shared.playlists) { playlist in
                        Button(playlist.name) {
                            LibraryManager.shared.addTrackToPlaylist(trackId: result.id, playlistId: playlist.id)
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
            // If already downloaded, play it instantly
            if let url = URL(string: track.url) {
                audioPlayer.play(url: url, track: track)
            }
        } else {
            // Just download it to the library without interrupting current playback
            libraryManager.downloadTrack(track)
        }
    }
}

#Preview {
    IslandSearchView(audioPlayer: AudioPlayerManager.shared)
        .background(Color.black)
}

