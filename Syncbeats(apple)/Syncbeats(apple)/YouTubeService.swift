import Foundation
import Combine

class YouTubeService: ObservableObject {
    static let shared = YouTubeService()
    
    // Using localhost for dev, can be swapped via env variables later
    private let baseURL = Config.backendURL
    
    // Models
    struct Playlist: Codable, Identifiable {
        let id: String
        let title: String
        let thumbnail: String?
        let itemCount: Int?
    }
    
    struct Track: Codable, Identifiable {
        let id: String
        let title: String
        let artist: String
        let thumbnail: String?
        let duration: String? // for search results
    }
    
    struct CategorySection: Codable, Identifiable {
        var id = UUID()
        let title: String
        let playlists: [Playlist]?
        let tracks: [Track]?
        
        private enum CodingKeys: String, CodingKey {
            case title, playlists, tracks
        }
    }
    
    @Published var personalPlaylists: [Playlist] = []
    @Published var homeSections: [CategorySection] = []
    @Published var searchResults: [Track] = []
    @Published var currentPlaylistTracks: [Track] = []
    
    @Published var isLoading: Bool = false
    @Published var error: String? = nil
    
    private init() {}
    
    // MARK: - JWT Helper
    var currentUserId: String? {
        guard let token = AuthManager.shared.appToken else { return nil }
        let segments = token.components(separatedBy: ".")
        guard segments.count > 1 else { return nil }
        var base64 = segments[1]
        let padding = base64.count % 4
        if padding > 0 { base64 += String(repeating: "=", count: 4 - padding) }
        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return json["userId"] as? String
    }
    
    // MARK: - Networking Core
    
    private func fetch<T: Codable>(endpoint: String, responseType: T.Type) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        
        // Always pass both tokens if we have them. The server will use what it needs.
        if let ytToken = AuthManager.shared.ytToken {
            request.addValue("Bearer \(ytToken)", forHTTPHeaderField: "Authorization")
        } else if let appToken = AuthManager.shared.appToken {
            request.addValue("Bearer \(appToken)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        
        if !(200...299).contains(httpResponse.statusCode) {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown Error"
            print("YouTubeService Error [\(httpResponse.statusCode)]: \(errorMsg)")
            throw URLError(.badServerResponse)
        }
        
        return try JSONDecoder().decode(T.self, from: data)
    }
    
    private func post(endpoint: String, body: [String: Any]) async {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let data = try? JSONSerialization.data(withJSONObject: body) {
            request.httpBody = data
        }
        _ = try? await URLSession.shared.data(for: request)
    }
    
    // MARK: - API Methods
    
    @MainActor
    func fetchLibrary() async {
        isLoading = true
        error = nil
        do {
            struct LibraryResponse: Codable { let playlists: [Playlist] }
            let res = try await fetch(endpoint: "/youtube/library", responseType: LibraryResponse.self)
            self.personalPlaylists = res.playlists
        } catch {
            self.error = error.localizedDescription
            print("Failed to fetch library: \(error)")
        }
        isLoading = false
    }
    
    @MainActor
    func fetchHomeData() async {
        isLoading = true
        error = nil
        do {
            struct HomeResponse: Codable { let sections: [CategorySection] }
            let uid = currentUserId ?? ""
            let res = try await fetch(endpoint: "/youtube/home?userId=\(uid)", responseType: HomeResponse.self)
            self.homeSections = res.sections
        } catch {
            self.error = error.localizedDescription
            print("Failed to fetch home data: \(error)")
        }
        isLoading = false
    }
    
    @MainActor
    func fetchPlaylistItems(playlistId: String) async {
        isLoading = true
        error = nil
        self.currentPlaylistTracks = []
        do {
            struct ItemsResponse: Codable { let tracks: [Track] }
            let res = try await fetch(endpoint: "/youtube/playlistItems?playlistId=\(playlistId)", responseType: ItemsResponse.self)
            self.currentPlaylistTracks = res.tracks
        } catch {
            self.error = error.localizedDescription
            print("Failed to fetch playlist items: \(error)")
        }
        isLoading = false
    }
    
    @MainActor
    func search(query: String) async {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            self.searchResults = []
            return
        }
        
        isLoading = true
        error = nil
        do {
            struct SearchResponse: Codable { let results: [Track] }
            // URL encode the query
            let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
            let res = try await fetch(endpoint: "/search/youtube?q=\(encodedQuery)", responseType: SearchResponse.self)
            self.searchResults = res.results
        } catch {
            self.error = error.localizedDescription
            print("Failed to search: \(error)")
        }
        isLoading = false
    }
    
    // MARK: - History Tracking
    
    func logSearch(query: String) {
        guard let userId = currentUserId else { return }
        Task {
            await post(endpoint: "/history/search", body: [
                "userId": userId,
                "query": query
            ])
        }
    }
    
    func logListen(track: Track) {
        guard let userId = currentUserId else { return }
        Task {
            await post(endpoint: "/history/listen", body: [
                "userId": userId,
                "youtubeId": track.id,
                "title": track.title,
                "artist": track.artist,
                "thumbnail": track.thumbnail ?? ""
            ])
        }
    }
}
