import Foundation

struct LoginRequest: Codable {
    let email: String
    let password: String
}

struct RegisterRequest: Codable {
    let name: String
    let email: String
    let password: String
}

struct AuthResponse: Codable {
    let ok: Bool?
    let token: String?
    let user: User?
    let error: String?
}

struct User: Codable, Identifiable {
    let id: String
    let name: String
    let email: String
}

struct ErrorResponse: Codable {
    let error: String
}

struct SearchResponse: Codable {
    let results: [SearchResult]
    let error: String?
}

struct SearchResult: Codable, Identifiable {
    let id: String
    let title: String
    let artist: String
    let duration: String
    let thumbnail: String
    
    /// Construct the audio download URL from the video id
    var audioURL: String {
        return "http://192.168.29.61:4000/search/youtube/download?videoId=\(id)"
    }
}

struct PublicDevice: Codable, Identifiable {
    let id: String
    let device_key: String
    let name: String
    let user_agent: String?
    let created_at: String
    let updated_at: String
    let last_seen_at: String
}

struct DevicesResponse: Codable {
    let devices: [PublicDevice]
}

/// Tracks metadata about a song
struct TrackInfo: Codable, Identifiable {
    var id: String
    var title: String
    var artist: String
    var thumbnailURL: String
    var duration: TimeInterval
    var url: String
}

/// A user-created playlist containing tracks
struct Playlist: Codable, Identifiable {
    var id: String = UUID().uuidString
    var name: String
    var trackIds: [String]
}
