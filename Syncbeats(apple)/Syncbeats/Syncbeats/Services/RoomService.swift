import Foundation

enum RoomServiceError: LocalizedError {
    case noRoom

    var errorDescription: String? { "No room available for this account." }
}

struct RoomService {
    static let shared = RoomService()
    private init() {}

    /// The user's own room, creating one if they don't have it yet.
    ///
    /// `/rooms/mine` also returns rooms the user merely *joined*, so taking
    /// `rooms.first` can drop this Mac into somebody else's room and merge the
    /// queues (CLAUDE.md pitfall #8). Match on host id instead.
    func resolveOwnRoom(hostUserId: String) async throws -> String {
        let mine: MineRoomsResponse = try await APIClient.shared.request(
            path: "/rooms/mine",
            requiresAuth: true
        )

        if let owned = mine.rooms.first(where: { $0.hostId == hostUserId && $0.endedAt == nil }) {
            return owned.id
        }

        do {
            let created: CreateRoomResponse = try await APIClient.shared.request(
                path: "/rooms",
                method: "POST",
                requiresAuth: true
            )
            return created.roomId
        } catch let error as APIError {
            // 409 means the server found an active room we somehow missed — re-read.
            if case .serverError(409, _) = error {
                let retry: MineRoomsResponse = try await APIClient.shared.request(
                    path: "/rooms/mine",
                    requiresAuth: true
                )
                if let owned = retry.rooms.first(where: { $0.hostId == hostUserId }) { return owned.id }
            }
            throw error
        }
    }
}
