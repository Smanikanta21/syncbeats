import Foundation
import Combine

class LibraryManager: ObservableObject {
    static let shared = LibraryManager()
    
    @Published var downloadedTracks: [TrackInfo] = []
    @Published var playlists: [Playlist] = []
    @Published var downloadingTracks: Set<String> = []
    
    private let tracksKey = "LibraryManager_DownloadedTracks"
    private let playlistsKey = "LibraryManager_Playlists"
    
    private init() {
        loadLibrary()
    }
    
    private func loadLibrary() {
        if let data = UserDefaults.standard.data(forKey: tracksKey),
           let decoded = try? JSONDecoder().decode([TrackInfo].self, from: data) {
            downloadedTracks = decoded
        }
        
        if let data = UserDefaults.standard.data(forKey: playlistsKey),
           let decoded = try? JSONDecoder().decode([Playlist].self, from: data) {
            playlists = decoded
        }
    }
    
    private func saveLibrary() {
        if let encoded = try? JSONEncoder().encode(downloadedTracks) {
            UserDefaults.standard.set(encoded, forKey: tracksKey)
        }
        if let encoded = try? JSONEncoder().encode(playlists) {
            UserDefaults.standard.set(encoded, forKey: playlistsKey)
        }
    }
    
    // MARK: - Tracks
    
    func saveDownloadedTrack(_ track: TrackInfo) {
        // Prevent duplicates
        DispatchQueue.main.async {
            self.downloadingTracks.remove(track.id)
            if !self.downloadedTracks.contains(where: { $0.id == track.id }) {
                self.downloadedTracks.insert(track, at: 0)
                self.saveLibrary()
            }
        }
    }
    
    /// Starts a background download of a track without interrupting current playback
    func downloadTrack(_ track: TrackInfo) {
        guard !downloadedTracks.contains(where: { $0.id == track.id }) else { return }
        
        DispatchQueue.main.async {
            self.downloadingTracks.insert(track.id)
        }
        
        guard let remoteURL = URL(string: track.url) else { return }
        
        LocalCacheManager.shared.downloadTrack(id: track.id, remoteURL: remoteURL) { [weak self] result in
            switch result {
            case .success(_):
                self?.saveDownloadedTrack(track)
            case .failure(let error):
                print("Failed to download track: \(error)")
                DispatchQueue.main.async {
                    self?.downloadingTracks.remove(track.id)
                }
            }
        }
    }
    
    func deleteTrack(_ trackId: String) {
        downloadedTracks.removeAll { $0.id == trackId }
        // Also remove from playlists
        for i in 0..<playlists.count {
            playlists[i].trackIds.removeAll { $0 == trackId }
        }
        saveLibrary()
        
        // Remove file
        if let url = LocalCacheManager.shared.getLocalURL(for: trackId) {
            try? FileManager.default.removeItem(at: url)
        }
    }
    
    // MARK: - Playlists
    
    func createPlaylist(name: String) {
        let playlist = Playlist(name: name, trackIds: [])
        playlists.append(playlist)
        saveLibrary()
    }
    
    func deletePlaylist(id: String) {
        playlists.removeAll { $0.id == id }
        saveLibrary()
    }
    
    func addTrackToPlaylist(trackId: String, playlistId: String) {
        if let index = playlists.firstIndex(where: { $0.id == playlistId }) {
            if !playlists[index].trackIds.contains(trackId) {
                playlists[index].trackIds.append(trackId)
                saveLibrary()
            }
        }
    }
    
    func removeTrackFromPlaylist(trackId: String, playlistId: String) {
        if let index = playlists.firstIndex(where: { $0.id == playlistId }) {
            playlists[index].trackIds.removeAll { $0 == trackId }
            saveLibrary()
        }
    }
    
    func getTracksForPlaylist(_ playlist: Playlist) -> [TrackInfo] {
        return playlist.trackIds.compactMap { id in
            downloadedTracks.first(where: { $0.id == id })
        }
    }
}
