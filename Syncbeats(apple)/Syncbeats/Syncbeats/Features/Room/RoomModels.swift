import Foundation

struct RoomTrack: Decodable, Identifiable, Equatable {
    let id: String
    let trackUrl: String
    let title: String
    let artist: String?
    let thumbnail: String?
    var albumArt: String? = nil
    let durationSec: Double?
    let isCurrent: Bool?
    let queueIndex: Int?

    var artworkRequest: AlbumArtworkRequest {
        let embedded = URLComponents(string: trackUrl)?.queryItems?.first(where: { $0.name == "thumb" })?.value
        return AlbumArtworkRequest(title: title, artist: artist, suppliedURL: AlbumArtworkRequest.firstCover(in: [albumArt, thumbnail, embedded]), sourceID: YouTubeIdentity.id(in: trackUrl))
    }
    var artworkURL: URL? { artworkRequest.suppliedURL }
    var playableDuration: Double? { durationSec.flatMap { $0 > 0 && $0.isFinite ? $0 : nil } }
    var artistLabel: String { artist.flatMap { $0.isEmpty ? nil : $0 } ?? "Shared with your room" }
}

struct RoomParticipant: Decodable, Identifiable {
    let socketId: String
    let displayName: String
    let isReady: Bool
    let isBlocked: Bool?
    let userId: String?
    let outputDeviceName: String?
    var volume: Double? = nil
    var id: String { socketId }
    var shortDeviceName: String {
        let full = (outputDeviceName ?? displayName).trimmingCharacters(in: .whitespacesAndNewlines)
        let unowned = full.components(separatedBy: "’s ").last?.components(separatedBy: "'s ").last ?? full
        let name = unowned.isEmpty ? "Device" : unowned
        return name.count > 14 ? String(name.prefix(13)) + "…" : name
    }
}

struct RoomSnapshot: Decodable {
    let roomId: String
    let roomInstanceId: String?
    let trackUrl: String?
    let position: Double
    let state: String
    let timestamp: Double
    let participants: [RoomParticipant]
    let queue: [RoomTrack]
    let isPlaying: Bool?
    let pendingPlay: Bool?
    var playbackInstanceId: String? = nil
    var startEpoch: Double? = nil
    var pauseOffset: Double? = nil
    var timeline: RoomTimeline? = nil
    var scheduledStartEpoch: Double? = nil
    let shuffle: Bool
    let repeatMode: String
}

struct RoomSearchResult: Decodable, Identifiable {
    let url: String
    let title: String
    let thumbnail: String?
    var albumArt: String? = nil
    let uploaderName: String?
    let duration: Double?
    var id: String { url }
    var artworkRequest: AlbumArtworkRequest {
        AlbumArtworkRequest(title: title, artist: uploaderName, suppliedURL: AlbumArtworkRequest.firstCover(in: [albumArt, thumbnail]), sourceID: YouTubeIdentity.id(in: url))
    }
    var artworkURL: URL? { artworkRequest.suppliedURL }
}

enum DiscoveryGenre: String, CaseIterable, Identifiable {
    case all = "All", electronic = "Electronic", indie = "Indie", instrumental = "Instrumental", soul = "Soul"
    var id: String { rawValue }
    var query: String {
        switch self {
        case .all: return "chill indie electronic soul music"
        case .electronic: return "electronic music chill"
        case .indie: return "indie music"
        case .instrumental: return "instrumental music"
        case .soul: return "soul music"
        }
    }
}

struct ListeningHistory: Decodable {
    struct Listen: Decodable {
        let youtubeId: String
        let title: String
        let artist: String?
        let thumbnail: String?
        var result: RoomSearchResult? {
            guard youtubeId.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else { return nil }
            return RoomSearchResult(url: "https://www.youtube.com/watch?v=\(youtubeId)", title: title, thumbnail: thumbnail, uploaderName: artist, duration: nil)
        }
    }
    let listens: [Listen]
}

enum YouTubeIdentity {
    static func key(for value: String) -> String { id(in: value).map { "youtube:\($0)" } ?? value }
    static func id(in value: String) -> String? {
        let patterns = ["^ws-p2p:yt:([A-Za-z0-9_-]{11})_[0-9]{10,13}", "(?:youtube:|youtu\\.be/|[?&]v=|youtube_)([A-Za-z0-9_-]{11})(?=[^A-Za-z0-9_-]|$)"]
        for pattern in patterns {
            guard let expression = try? NSRegularExpression(pattern: pattern),
                  let match = expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)),
                  let range = Range(match.range(at: 1), in: value) else { continue }
            return String(value[range])
        }
        return nil
    }
}

enum RoomConnectionState: Equatable {
    case idle, connecting, connected, reconnecting, awaitingApproval, failed
    var label: String {
        switch self {
        case .idle: return "Opening room"
        case .connecting: return "Connecting"
        case .connected: return "Connected"
        case .reconnecting: return "Reconnecting"
        case .awaitingApproval: return "Waiting for approval"
        case .failed: return "Connection unavailable"
        }
    }
}

func playbackTime(_ seconds: Double) -> String {
    guard seconds.isFinite else { return "0:00" }
    let value = Int(min(max(0, seconds), 359999))
    return String(format: "%d:%02d", value / 60, value % 60)
}

/// Shared layout boundaries let verification exercise the actual production rules.
enum RoomLayout {
    enum DevicePresentation { case summary, drawer, docked }
    static func devices(width: CGFloat) -> DevicePresentation { width >= 1100 ? .docked : width >= 880 ? .drawer : .summary }
    static func showsQueueAlongside(width: CGFloat) -> Bool { width >= 880 }
}

struct RoomTimeline: Decodable {
    let startEpoch: Double?
    let pauseOffset: Double
    let isPlaying: Bool
}

enum PlaybackCommand {
    static func toggle(playing: Bool, pending: Bool) -> String {
        playing || pending ? "playback:pause" : "playback:play"
    }
}
