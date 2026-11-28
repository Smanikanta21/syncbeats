import Foundation

enum NativeLibrarySection: String, CaseIterable, Identifiable {
    case home = "Home", songs = "Songs", playlists = "Playlists", albums = "Albums", artists = "Artists"
    var id: String { rawValue }
    var symbol: String {
        switch self { case .home: "house"; case .songs: "music.note"; case .playlists: "music.note.list"; case .albums: "square.stack"; case .artists: "person.2" }
    }
}

nonisolated enum NativeLibraryArtwork {
    /// Only share remote covers; MusicKit may return artwork local to this device.
    static func remoteURL(in candidates: [String?]) -> String? {
        for candidate in candidates {
            guard let candidate, candidate.utf8.count <= 4096,
                  let url = URL(string: candidate), url.user == nil, url.password == nil,
                  let cover = AlbumArtworkRequest.coverURL(url), cover.absoluteString.utf8.count <= 4096 else { continue }
            return cover.absoluteString
        }
        return nil
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
                                albumArt: artwork, metadataSource: "library", uploaderName: artist, duration: duration)
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
    var artworkSong: NativeLibrarySong? {
        songs.first(where: { $0.discoveryRequest.album.suppliedURL != nil })
            ?? songs.first(where: { $0.discoveryRequest.thumbnail != nil }) ?? songs.first
    }
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
        var songIndexes = Dictionary(songs.enumerated().map { ($0.element.id, $0.offset) }, uniquingKeysWith: { first, _ in first })
        var playlistIndexes = Dictionary(playlists.enumerated().map { ($0.element.id, $0.offset) }, uniquingKeysWith: { first, _ in first })
        for song in incoming.map(preservingMatch) {
            if let index = songIndexes[song.id] { songs[index] = song }
            else { songIndexes[song.id] = songs.count; songs.append(song) }
        }
        for var playlist in incomingPlaylists {
            if let index = playlistIndexes[playlist.id] {
                let edited = playlists[index]
                playlist.editedName = edited.editedName
                if let name = edited.editedName { playlist.name = name }
                playlist.addedSongIDs = edited.addedSongIDs
                let manual = Set(edited.addedSongIDs ?? [])
                let sourceIDs = Set(playlist.songs.map(\.id))
                playlist.songs.append(contentsOf: edited.songs.filter { manual.contains($0.id) && !sourceIDs.contains($0.id) })
            }
            playlist.songs = playlist.songs.map(preservingMatch)
            for song in playlist.songs where songIndexes[song.id] == nil {
                songIndexes[song.id] = songs.count; songs.append(song)
            }
            if let index = playlistIndexes[playlist.id] { playlists[index] = playlist }
            else { playlistIndexes[playlist.id] = playlists.count; playlists.append(playlist) }
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
        var albumKeys: [String: String] = [:], artistKeys: [String: String] = [:]
        var groups: [String: [NativeLibrarySong]] = [:]
        for song in songs {
            guard let album = song.album else { continue }
            let albumKey: String
            if let cached = albumKeys[album] { albumKey = cached }
            else {
                guard !album.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
                albumKey = AlbumArtworkRequest.normalized(album); albumKeys[album] = albumKey
            }
            let artistKey = artistKeys[song.artist] ?? AlbumArtworkRequest.normalized(song.artist)
            artistKeys[song.artist] = artistKey
            groups[albumKey + ":" + artistKey, default: []].append(song)
        }
        return groups
            .map { key, tracks in .init(id: key, name: tracks[0].album!, subtitle: tracks[0].artist, songs: tracks) }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    static func artists(_ songs: [NativeLibrarySong]) -> [NativeLibraryGroup] {
        var identities: [String: (name: String, key: String)] = [:]
        var groups: [String: [NativeLibrarySong]] = [:]
        for song in songs {
            let identity: (name: String, key: String)
            if let cached = identities[song.artist] { identity = cached }
            else {
                let name = AlbumArtworkRequest.cleanArtist(song.artist)
                identity = (name, AlbumArtworkRequest.normalized(name)); identities[song.artist] = identity
            }
            guard !identity.name.isEmpty else { continue }
            groups[identity.key, default: []].append(song)
        }
        return groups
            .map { key, tracks in .init(id: key, name: identities[tracks[0].artist]!.name, subtitle: "\(tracks.count) songs", songs: tracks) }
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
