import Foundation

struct Config {
    static let backendURL = "http://localhost:4000"
}

// MARK: - Room Synchronization Models

struct RoomSnapshot: Codable {
    let roomId: String
    let hostId: String?
    let isPrivate: Bool
    let trackUrl: String?
    let state: String // "playing", "paused", "buffering"
    let position: Double // Position in milliseconds
    let participants: [Participant]
    let queue: [TrackQueueItem]
    let shuffle: Bool
    let repeatMode: String // "off", "track", "all"
}

struct Participant: Codable, Identifiable {
    var id: String { socketId }
    let socketId: String
    let displayName: String
    let userId: String?
    let joinedAt: Double
    let isReady: Bool
    let volume: Double?
    let latency: Double?
    let jitter: Double?
    let outputDeviceName: String?
    let outputDeviceType: String?
    let isBlocked: Bool?
}

struct SpatialPosition: Codable {
    let x: Double
    let y: Double
    let z: Double
}

struct TrackQueueItem: Codable, Identifiable {
    let id: String
    let trackUrl: String
    let title: String
    let addedBy: String
    let createdAt: Double
    let isCurrent: Bool?
}

// MARK: - Networking / NTP Models

struct PingPayload: Codable {
    let t0: Double
    let seq: Int
}

struct PongPayload: Codable {
    let t0: Double
    let t1: Double
    let t2: Double
    let seq: Int
}

// MARK: - Social Features

struct ChatMessage: Codable, Identifiable {
    let id: String
    let socketId: String
    let displayName: String
    let message: String
    let timestamp: Double
}

struct Reaction: Codable {
    let socketId: String
    let emoji: String
}
