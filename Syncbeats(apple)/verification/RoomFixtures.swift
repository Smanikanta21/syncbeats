import Foundation

/// Fictional review data, compiled only into verification tools.
enum RoomFixtures {
    static func snapshot(playing: Bool = false, empty: Bool = false, originalArtwork: Bool = false, queueCount: Int? = nil) throws -> RoomSnapshot {
        let tracks: [[String: Any]] = empty ? [] : [
            ["id": "one", "trackUrl": "fixture:one", "title": "After the rain", "artist": "Studio Sessions", "durationSec": 218, "isCurrent": true, "queueIndex": 0],
            ["id": "two", "trackUrl": "fixture:two", "title": "A little closer", "artist": "The Evening Collection", "durationSec": 192, "isCurrent": false, "queueIndex": 1],
            ["id": "three", "trackUrl": "fixture:three", "title": "Somewhere quiet", "artist": "Slow Hours", "durationSec": 254, "isCurrent": false, "queueIndex": 2]
        ]
        var reviewTracks = tracks
        if let count = queueCount, !tracks.isEmpty {
            reviewTracks = (0..<count).map { index in
                var track = tracks[index % tracks.count]
                track["id"] = index == 0 ? "one" : "fixture-\(index)"
                track["isCurrent"] = index == 0
                track["queueIndex"] = index
                return track
            }
        }
        if originalArtwork {
            let songs = try originalSongs()
            for index in reviewTracks.indices where !songs.isEmpty {
                let song = songs[index % songs.count]
                reviewTracks[index]["title"] = song.title
                reviewTracks[index]["artist"] = song.uploaderName
                reviewTracks[index]["albumArt"] = song.thumbnail
            }
        }
        let data: [String: Any] = [
            "roomId": "123456", "roomInstanceId": "review-room", "trackUrl": empty ? NSNull() : "fixture:one",
            "position": empty ? 0 : 42000, "state": playing ? "PLAYING" : "PAUSED", "timestamp": Date().timeIntervalSince1970 * 1000,
            "isPlaying": playing, "pendingPlay": false, "shuffle": false, "repeatMode": "off", "queue": reviewTracks,
            "participants": [
                ["socketId": "mac-review", "displayName": "Studio Mac", "isReady": false, "isBlocked": true],
                ["socketId": "player-review", "displayName": "Living room", "isReady": true, "isBlocked": false, "outputDeviceName": "Room speakers"]
            ]
        ]
        return try JSONDecoder().decode(RoomSnapshot.self, from: JSONSerialization.data(withJSONObject: data))
    }
    static func originalSongs() throws -> [RoomSearchResult] {
        let url = URL(fileURLWithPath: ProcessInfo.processInfo.environment["SYNCBEATS_COVER_FIXTURES"] ?? "/tmp/syncbeats-native-cover-fixtures.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        return try JSONDecoder().decode([RoomSearchResult].self, from: Data(contentsOf: url))
    }
}
