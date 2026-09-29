import Foundation

class RoomService {
    static let shared = RoomService()
    
    private init() {}
    
    func getMyRooms() async throws -> [RoomRecord] {
        let response: MineRoomsResponse = try await APIClient.shared.request(
            path: "/rooms/mine",
            requiresAuth: true
        )
        return response.rooms
    }
    
    func createRoom() async throws -> String {
        let response: CreateRoomResponse = try await APIClient.shared.request(
            path: "/rooms",
            method: "POST",
            requiresAuth: true
        )
        return response.roomId
    }
}
