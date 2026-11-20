import Foundation

// MARK: - Models

struct User: Codable, Identifiable {
    let id: String
    let name: String
    let email: String
    let authProvider: String
    let emailVerifiedAt: String?
    let createdAt: String
    
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case email
        case authProvider = "auth_provider"
        case emailVerifiedAt = "email_verified_at"
        case createdAt = "created_at"
    }
}

struct Device: Codable, Identifiable {
    let id: String
    let deviceKey: String
    let name: String
    let userAgent: String?
    let createdAt: String
    let updatedAt: String
    let lastSeenAt: String
    
    enum CodingKeys: String, CodingKey {
        case id
        case deviceKey = "device_key"
        case name
        case userAgent = "user_agent"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case lastSeenAt = "last_seen_at"
    }
}

struct AuthResponse: Codable {
    let user: User
    let token: String
    let device: Device?
    let needsDeviceRename: Bool
}

struct APIErrorResponse: Codable {
    let error: String
}
