import Foundation

enum NativeLibrarySection: String, CaseIterable, Identifiable {
    case home = "Home", songs = "Songs", playlists = "Playlists", albums = "Albums", artists = "Artists"
    var id: String { rawValue }
    var symbol: String {
        switch self { case .home: "house"; case .songs: "music.note"; case .playlists: "music.note.list"; case .albums: "square.stack"; case .artists: "person.2" }
    }
}

nonisolated struct NativeLibrarySong: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var title: String
    var artist: String
    var album: String?
    var artwork: String?
    var thumbnail: String?
    var duration: Double?
    var youtubeID: String?
    var sourceSongID: String? = nil
    var source: String

    var collectionKey: String { source == "APPLE_MUSIC" ? id : youtubeID.flatMap { $0.isEmpty ? nil : "youtube:" + $0 } ?? id }

    var result: RoomSearchResult? {
        guard let youtubeID, youtubeID.range(of: #"^[A-Za-z0-9_-]{11}$"#, options: .regularExpression) != nil else { return nil }
        return RoomSearchResult(url: "https://www.youtube.com/watch?v=\(youtubeID)", title: title, thumbnail: thumbnail,
                                albumArt: artwork, uploaderName: artist, duration: duration)
    }
    var discoveryRequest: DiscoverySongArtworkRequest {
        let cover = AlbumArtworkRequest(title: title, artist: artist, suppliedURL: AlbumArtworkRequest.firstCover(in: [artwork, thumbnail]), sourceID: youtubeID)
        return .init(title: title, artist: artist, album: cover, thumbnail: thumbnail)
    }
}

nonisolated struct NativeLibraryPlaylist: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var description: String?
    var artwork: String?
    var source: String
    var songs: [NativeLibrarySong]
    var editedName: String? = nil
    var addedSongIDs: [String]? = nil
    var trackCount: Int? = nil
    var preview: NativeLibrarySong? = nil
    var displayedCount: Int { trackCount ?? songs.count }
    var serverID: String? { id.hasPrefix("server:") ? String(id.dropFirst(7)) : nil }
    var canManage: Bool { !(serverID != nil && source == "SYNCBEATS" && name == "Liked Songs") }
}

nonisolated enum NativePlaylistSongDisposition: String, CaseIterable, Sendable {
    case keep, remove
}

nonisolated struct NativeLibraryGroup: Identifiable, Sendable {
    let id: String
    let name: String
    let subtitle: String
    let songs: [NativeLibrarySong]
    var filter: NativeLibraryGroupFilter? = nil
    var total: Int? = nil
}

nonisolated struct NativeLibraryGroupFilter: Equatable, Sendable { let album: String?; let artist: String }
nonisolated struct NativeLibraryResultPage<Item: Sendable>: Sendable { let items: [Item]; let nextCursor: String?; var playlist: NativeLibraryPlaylist? = nil }
nonisolated struct NativeLibraryIndexPage: Sendable { let playlists: [NativeLibraryPlaylist]; let nextCursor: String?; let savedYoutubeIDs: Set<String>; var requiresServerUpdate: Bool = false }
nonisolated struct NativeLibraryCatalogPage: Sendable { let songs: [NativeLibrarySong]; let groups: [NativeLibraryGroup]; let nextCursor: String?; let total: Int }

nonisolated struct NativeImportedLibrary: Codable, Sendable {
    var songs: [NativeLibrarySong] = []
    var playlists: [NativeLibraryPlaylist] = []

    mutating func merge(songs incoming: [NativeLibrarySong], playlists incomingPlaylists: [NativeLibraryPlaylist]) {
        let previous = Dictionary(songs.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        func preservingMatch(_ song: NativeLibrarySong) -> NativeLibrarySong {
            var updated = song
            if updated.youtubeID == nil { updated.youtubeID = previous[song.id]?.youtubeID }
            return updated
        }
        for song in incoming.map(preservingMatch) {
            if let index = songs.firstIndex(where: { $0.id == song.id }) { songs[index] = song }
            else { songs.append(song) }
        }
        for var playlist in incomingPlaylists {
            if let edited = playlists.first(where: { $0.id == playlist.id }) {
                playlist.editedName = edited.editedName
                if let name = edited.editedName { playlist.name = name }
                playlist.addedSongIDs = edited.addedSongIDs
                let manual = Set(edited.addedSongIDs ?? [])
                let sourceIDs = Set(playlist.songs.map(\.id))
                playlist.songs.append(contentsOf: edited.songs.filter { manual.contains($0.id) && !sourceIDs.contains($0.id) })
            }
            playlist.songs = playlist.songs.map(preservingMatch)
            for song in playlist.songs where !songs.contains(where: { $0.id == song.id }) { songs.append(song) }
            if let index = playlists.firstIndex(where: { $0.id == playlist.id }) { playlists[index] = playlist }
            else { playlists.append(playlist) }
        }
    }
}

nonisolated enum NativeLibraryCollection {
    static func songs(playlists: [NativeLibraryPlaylist], imported: [NativeLibrarySong]) -> [NativeLibrarySong] {
        var indexes: [String: Int] = [:], unique: [NativeLibrarySong] = []
        for song in playlists.flatMap(\.songs) + imported {
            // A video's identity is shared across saved playlists; Apple library IDs remain distinct recordings.
            let key = song.collectionKey
            if let index = indexes[key] {
                if unique[index].album == nil { unique[index].album = song.album }
                if unique[index].artwork == nil { unique[index].artwork = song.artwork }
                if unique[index].duration == nil { unique[index].duration = song.duration }
            } else { indexes[key] = unique.count; unique.append(song) }
        }
        return unique
    }
    static func albums(_ songs: [NativeLibrarySong]) -> [NativeLibraryGroup] {
        let known = songs.filter { !($0.album?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) }
        return Dictionary(grouping: known) { AlbumArtworkRequest.normalized($0.album!) + ":" + AlbumArtworkRequest.normalized($0.artist) }
            .map { key, tracks in .init(id: key, name: tracks[0].album!, subtitle: tracks[0].artist, songs: tracks) }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    static func artists(_ songs: [NativeLibrarySong]) -> [NativeLibraryGroup] {
        let known = songs.filter { !AlbumArtworkRequest.cleanArtist($0.artist).isEmpty }
        return Dictionary(grouping: known) { AlbumArtworkRequest.normalized(AlbumArtworkRequest.cleanArtist($0.artist)) }
            .map { key, tracks in .init(id: key, name: AlbumArtworkRequest.cleanArtist(tracks[0].artist), subtitle: "\(tracks.count) songs", songs: tracks) }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
}

nonisolated struct NativeLibraryTrackPayload: Decodable, Sendable {
    struct Catalog: Decodable, Sendable {
        let id: String?
        let title: String?
        let artist: String?
        let album: String?
        let albumArt: String?
        let youtubeId: String?
        let duration: Double?
    }
    let id: String
    let title: String
    let artist: String?
    let thumbnail: String?
    let youtubeId: String?
    let resolvedYoutubeId: String?
    let resolvedThumbnail: String?
    let song: Catalog?

    func item(source: String) -> NativeLibrarySong {
        let candidates = [resolvedYoutubeId, song?.youtubeId, youtubeId]
        let video = candidates.compactMap { $0 }.first { $0.range(of: #"^[A-Za-z0-9_-]{11}$"#, options: .regularExpression) != nil }
        return .init(id: "catalog:" + (song?.id ?? id), title: song?.title ?? title, artist: song?.artist ?? artist ?? "", album: song?.album,
                     artwork: song?.albumArt, thumbnail: resolvedThumbnail ?? thumbnail, duration: song?.duration,
                     youtubeID: video, sourceSongID: song?.id, source: source)
    }
}

nonisolated struct NativeLibraryPlaylistPayload: Decodable, Sendable {
    let id: String
    let name: String
    let description: String?
    let coverUrl: String?
    let sourceType: String?
    let tracks: [NativeLibraryTrackPayload]?
    let trackCount: Int?
    var item: NativeLibraryPlaylist {
        let source = sourceType ?? "SYNCBEATS"
        return .init(id: "server:" + id, name: name, description: description, artwork: coverUrl,
                     source: source, songs: (tracks ?? []).map { $0.item(source: source) }, trackCount: trackCount)
    }
}

nonisolated struct NativeAppleImportBatch: Decodable, Sendable {
    let version: Int
    let playlistId: String
    let name: String
    let sourceId: String
    let trackCount: Int
    let added: Int
    let processed: Int
}
