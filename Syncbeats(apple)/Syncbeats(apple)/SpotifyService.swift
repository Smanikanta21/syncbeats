import Foundation
import Combine

class SpotifyService: ObservableObject {
    static let shared = SpotifyService()
    private let baseURL = Config.backendURL
    
    @Published var isImporting = false
    @Published var importError: String? = nil
    
    private init() {}
    
    @MainActor
    func importAndEnqueuePlaylist(url: String, roomId: String) async {
        isImporting = true
        importError = nil
        
        do {
            // 1. Import to SyncBeats
            let playlistId = try await importPlaylist(url: url)
            
            // 2. Enqueue to Room
            let count = try await enqueuePlaylist(roomId: roomId, playlistId: playlistId)
            print("Successfully enqueued \(count) tracks from Spotify Playlist.")
            
        } catch {
            self.importError = error.localizedDescription
            print("Failed to import/enqueue Spotify playlist: \(error)")
        }
        
        isImporting = false
    }
    
    func importPlaylist(url: String) async throws -> String {
        guard let token = AuthManager.shared.appToken else {
            throw URLError(.userAuthenticationRequired)
        }
        guard let requestUrl = URL(string: "\(baseURL)/api/bridge/import") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: requestUrl)
        request.httpMethod = "POST"
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "playlistUrl": url
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        
        if !(200...299).contains(httpResponse.statusCode) {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown Error"
            throw NSError(domain: "SpotifyService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMsg])
        }
        
        struct ImportResponse: Codable {
            let ok: Bool
            let playlistId: String
        }
        
        let res = try JSONDecoder().decode(ImportResponse.self, from: data)
        return res.playlistId
    }
    
    func enqueuePlaylist(roomId: String, playlistId: String) async throws -> Int {
        guard let token = AuthManager.shared.appToken else {
            throw URLError(.userAuthenticationRequired)
        }
        guard let requestUrl = URL(string: "\(baseURL)/rooms/\(roomId)/enqueue-playlist") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: requestUrl)
        request.httpMethod = "POST"
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "playlistId": playlistId
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        
        if !(200...299).contains(httpResponse.statusCode) {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown Error"
            throw NSError(domain: "SpotifyService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMsg])
        }
        
        struct EnqueueResponse: Codable {
            let success: Bool
            let enqueuedCount: Int
        }
        
        let res = try JSONDecoder().decode(EnqueueResponse.self, from: data)
        return res.enqueuedCount
    }
}
