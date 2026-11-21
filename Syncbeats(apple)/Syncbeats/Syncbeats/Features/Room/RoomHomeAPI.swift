import Foundation

/// Existing backend contracts used by the native home. All writes complete on the server first.
struct RoomHomeAPI {
    let credentials: RoomCredentials
    var http: URLSession = .shared

    func musicCatalog() async throws -> MusicCatalog {
        try await JSONDecoder().decode(MusicCatalog.self, from: request(path: "recommendations/catalog"))
    }
    func musicFeed() async throws -> MusicFeed {
        try await JSONDecoder().decode(MusicFeed.self, from: request(path: "recommendations/feed"))
    }
    func saveTaste(_ taste: MusicTaste) async throws {
        let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(taste)) as? [String: Any]
        _ = try await request(path: "recommendations/profile", method: "PUT", body: body)
    }
    func resetTaste() async throws { _ = try await request(path: "recommendations/profile", method: "DELETE") }
    func feedback(artistID: String, kind: String) async throws {
        _ = try await request(path: "recommendations/events", method: "POST", body: ["artistId": artistID, "kind": kind, "eventId": UUID().uuidString])
    }
    func logSearch(_ query: String) async throws {
        guard !query.lowercased().hasPrefix("http") else { return }
        _ = try await request(path: "history/search", method: "POST", body: ["query": query])
    }

    func discovery(_ genre: DiscoveryGenre) async throws -> [RoomSearchResult] {
        let data = try await request(path: "rooms/\(credentials.roomID)/youtube-search", query: [URLQueryItem(name: "q", value: genre.query)])
        return try JSONDecoder().decode([RoomSearchResult].self, from: data)
    }
    func history() async throws -> [RoomSearchResult] {
        let data = try await request(path: "history/recent", query: [URLQueryItem(name: "userId", value: credentials.userID)])
        let results = try JSONDecoder().decode(ListeningHistory.self, from: data).listens.compactMap(\.result)
        var seen: Set<String> = []
        return results.filter { seen.insert($0.id).inserted }
    }
    func reorder(itemID: String, newIndex: Int) async throws {
        guard newIndex >= 0 else { throw AuthFailure.invalidInput("Choose a valid queue position.") }
        _ = try await request(path: "rooms/\(credentials.roomID)/queue/reorder", method: "PUT", body: ["itemId": itemID, "newIndex": newIndex])
    }
    func enqueue(_ result: RoomSearchResult) async throws -> RoomTrack {
        struct Response: Decodable { let item: RoomTrack }
        let data = try await request(path: "rooms/\(credentials.roomID)/enqueue-youtube", method: "POST", body: ["youtubeUrl": result.url, "title": result.title, "durationSec": result.duration ?? 0])
        return try JSONDecoder().decode(Response.self, from: data).item
    }
    private func request(path: String, method: String = "GET", query: [URLQueryItem] = [], body: [String: Any]? = nil) async throws -> Data {
        guard var components = URLComponents(url: credentials.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else { throw AuthFailure.invalidResponse }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw AuthFailure.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
        request.setValue(credentials.deviceID, forHTTPHeaderField: "x-device-id")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body { request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await NativeDiagnostics.data(for: request, using: http,
            operation: NativeDiagnostics.operation(method: method, path: path))
        guard let response = response as? HTTPURLResponse else { throw AuthFailure.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw AuthFailure.response(response.statusCode, message ?? "The request couldn't be completed. Please try again.")
        }
        return data
    }
}
