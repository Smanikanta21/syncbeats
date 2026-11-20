import Foundation
import MusicKit
import Combine

struct LibraryTrack: Identifiable, Hashable {
    let id: String
    let title: String
    let artist: String
    let artwork: Artwork?
}

struct LibraryPlaylist: Identifiable, Hashable {
    let id: String
    let name: String
    let count: Int?
    fileprivate let source: Playlist

    // Identity is the playlist id — don't drag MusicKit's own equality in.
    static func == (lhs: LibraryPlaylist, rhs: LibraryPlaylist) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Reads the user's Apple Music library. Tracks are never uploaded — picking one
/// goes through MusicBridge, which maps it to a streamable equivalent.
@MainActor
final class MusicLibraryService: ObservableObject {
    @Published private(set) var status: MusicAuthorization.Status = MusicAuthorization.currentStatus
    @Published private(set) var playlists: [LibraryPlaylist] = []
    @Published private(set) var tracks: [LibraryTrack] = []
    @Published private(set) var isLoading = false
    @Published var selection: LibraryPlaylist?
    @Published var errorMessage: String?

    var isAuthorized: Bool { status == .authorized }

    func requestAuthorization() async {
        status = await MusicAuthorization.request()
        if status == .authorized { await loadPlaylists() }
    }

    /// Playlists plus everything in the library, so an empty-playlist library
    /// still has something to queue from.
    func loadPlaylists() async {
        guard isAuthorized else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await MusicLibraryRequest<Playlist>().response()
            playlists = response.items.map {
                LibraryPlaylist(id: $0.id.rawValue, name: $0.name, count: $0.tracks?.count, source: $0)
            }
            if selection == nil { await loadAllSongs() }
        } catch {
            errorMessage = "Couldn't read your playlists. \(error.localizedDescription)"
        }
    }

    func loadAllSongs() async {
        guard isAuthorized else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            var request = MusicLibraryRequest<Song>()
            request.limit = 300
            let response = try await request.response()
            tracks = response.items.map {
                LibraryTrack(id: $0.id.rawValue, title: $0.title, artist: $0.artistName, artwork: $0.artwork)
            }
        } catch {
            errorMessage = "Couldn't read your library. \(error.localizedDescription)"
        }
    }

    func loadTracks(for playlist: LibraryPlaylist) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let detailed = try await playlist.source.with([.tracks])
            tracks = (detailed.tracks ?? []).map {
                LibraryTrack(id: $0.id.rawValue, title: $0.title, artist: $0.artistName, artwork: $0.artwork)
            }
        } catch {
            errorMessage = "Couldn't read “\(playlist.name)”. \(error.localizedDescription)"
        }
    }
}
