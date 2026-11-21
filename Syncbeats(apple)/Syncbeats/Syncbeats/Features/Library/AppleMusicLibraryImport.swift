import Foundation
import MusicKit

nonisolated struct NativeAppleLibraryPreview: Sendable {
    var songs: [NativeLibrarySong] = []
    var playlists: [NativeLibraryPlaylist] = []
    var failedPlaylists: [String] = []
    var skippedVideos = 0
}

/// Imports library metadata only. Room audio continues through the existing bridge and room commands.
@MainActor enum AppleMusicLibraryImport {
    static func read() async throws -> NativeAppleLibraryPreview {
        let status = await MusicAuthorization.request()
        guard status == .authorized else {
            #if os(macOS)
            let instruction = "Allow Music access in System Settings → Privacy & Security → Media & Apple Music, then try again."
            #else
            let instruction = "Allow Music access in Settings → Privacy & Security → Media & Apple Music, then try again."
            #endif
            throw AuthFailure.invalidInput(status == .restricted ? "Apple Music access is restricted on \(NativeDevice.thisDevice)." : instruction)
        }
        var songRequest = MusicLibraryRequest<Song>(); songRequest.limit = 200
        var playlistRequest = MusicLibraryRequest<Playlist>(); playlistRequest.limit = 100
        let songQuery = songRequest, playlistQuery = playlistRequest
        async let songsResponse = songQuery.response()
        async let playlistsResponse = playlistQuery.response()
        let (songResponse, playlistResponse) = try await (songsResponse, playlistsResponse)
        let songs = try await all(songResponse.items)
        let playlists = try await all(playlistResponse.items)
        var preview = NativeAppleLibraryPreview(songs: songs.map(item))
        for playlist in playlists {
            try Task.checkCancellation()
            do {
                let detailed = try await playlist.with([.tracks], preferredSource: .library)
                guard let first = detailed.tracks else { throw AuthFailure.invalidResponse }
                let tracks = try await all(first)
                var songItems: [NativeLibrarySong] = []
                for track in tracks {
                    if case .song(let song) = track { songItems.append(item(song)) }
                    else { preview.skippedVideos += 1 }
                }
                preview.playlists.append(.init(id: "apple-playlist:" + playlist.id.rawValue, name: playlist.name,
                                              description: playlist.standardDescription, artwork: playlist.artwork?.url(width: 600, height: 600)?.absoluteString,
                                              source: "APPLE_MUSIC", songs: songItems))
            } catch {
                if Task.isCancelled { throw CancellationError() }
                preview.failedPlaylists.append(playlist.name)
            }
        }
        return preview
    }
    private static func all<Item: MusicItem>(_ first: MusicItemCollection<Item>) async throws -> [Item] {
        var batch = first, items = Array(first)
        while batch.hasNextBatch {
            try Task.checkCancellation()
            guard let next = try await batch.nextBatch(limit: 200), !next.isEmpty else { throw AuthFailure.invalidResponse }
            items.append(contentsOf: next); batch = next
        }
        return items
    }
    private static func item(_ song: Song) -> NativeLibrarySong {
        .init(id: "apple-song:" + song.id.rawValue, title: song.title, artist: song.artistName,
              album: song.albumTitle, artwork: song.artwork?.url(width: 600, height: 600)?.absoluteString,
              thumbnail: nil, duration: song.duration, youtubeID: nil, source: "APPLE_MUSIC")
    }
}
