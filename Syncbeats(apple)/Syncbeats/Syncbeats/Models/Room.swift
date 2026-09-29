import Foundation

struct RoomRecord: Codable, Identifiable {
    let id: String
    let hostId: String
    let trackUrl: String?
    let playbackState: String
    let positionMs: Int
    let createdAt: String
    let endedAt: String?
    let shuffle: Bool
    let repeatMode: String
    let isPrivate: Bool?
    let participantCount: Int?
    
    enum CodingKeys: String, CodingKey {
        case id
        case hostId = "host_id"
        case trackUrl = "track_url"
        case playbackState = "playback_state"
        case positionMs = "position_ms"
        case createdAt = "created_at"
        case endedAt = "ended_at"
        case shuffle
        case repeatMode = "repeat_mode"
        case isPrivate = "is_private"
        case participantCount = "participant_count"
    }
}

struct MineRoomsResponse: Codable {
    let rooms: [RoomRecord]
}

struct CreateRoomResponse: Codable {
    let roomId: String
    let createdAt: String
}
