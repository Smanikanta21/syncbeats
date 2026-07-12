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
        var thumbnail: String?
        let duration: String? // for search results
        var youtubeId: String? = nil // Only set for DB tracks so we can play them
        var songId: String? = nil    // Global Song catalog ID
        var isResolved: Bool { !(youtubeId?.isEmpty ?? true) }
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
    @Published var recentHistory: [Track] = []
    
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
        return json["sub"] as? String
    }
    
    // MARK: - Networking Core
    
    private func fetch<T: Codable>(endpoint: String, responseType: T.Type) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw URLError(.badURL)
        }
        
        var request = URLRequest(url: url)
        
        // Send the SyncBeats appToken for backend auth. 
        if let appToken = AuthManager.shared.appToken {
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
        if let appToken = AuthManager.shared.appToken {
            request.addValue("Bearer \(appToken)", forHTTPHeaderField: "Authorization")
        }
        if let data = try? JSONSerialization.data(withJSONObject: body) {
            request.httpBody = data
        }
        _ = try? await URLSession.shared.data(for: request)
    }
    
    private func put(endpoint: String, body: [String: Any]) async throws {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let appToken = AuthManager.shared.appToken {
            request.addValue("Bearer \(appToken)", forHTTPHeaderField: "Authorization")
        }
        if let data = try? JSONSerialization.data(withJSONObject: body) {
            request.httpBody = data
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown Error"
            print("YouTubeService PUT Error: \(errorMsg)")
            throw URLError(.badServerResponse)
        }
    }
    
    private func delete(endpoint: String) async throws {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        if let appToken = AuthManager.shared.appToken {
            request.addValue("Bearer \(appToken)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Unknown Error"
            print("YouTubeService DELETE Error: \(errorMsg)")
            throw URLError(.badServerResponse)
        }
    }
    
    // MARK: - API Methods
    
    @MainActor
    func fetchLibrary() async {
        isLoading = true
        error = nil
        do {
            struct LibraryResponse: Codable { let playlists: [Playlist] }
            let uid = currentUserId ?? ""
            let res = try await fetch(endpoint: "/youtube/library?userId=\(uid)", responseType: LibraryResponse.self)
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
    func fetchRecentHistory() async {
        do {
            struct HistoryListen: Codable {
                let youtubeId: String
                let title: String
                let artist: String?
                let thumbnail: String?
            }
            struct RecentHistoryResponse: Codable {
                let listens: [HistoryListen]
            }
            let uid = currentUserId ?? ""
            let res = try await fetch(endpoint: "/history/recent?userId=\(uid)", responseType: RecentHistoryResponse.self)
            self.recentHistory = res.listens.map { listen in
                Track(
                    id: listen.youtubeId,
                    title: listen.title,
                    artist: listen.artist ?? "Unknown Artist",
                    thumbnail: listen.thumbnail,
                    duration: nil,
                    youtubeId: listen.youtubeId
                )
            }
        } catch {
            print("Failed to fetch recent history: \(error)")
        }
    }
    
    @MainActor
    func fetchPlaylistItems(playlistId: String) async {
        error = nil
        self.currentPlaylistTracks = []
        do {
            let isDBPlaylist = UUID(uuidString: playlistId) != nil || playlistId.hasPrefix("c")
            
            if isDBPlaylist {
                // Song catalog nested response
                struct SongCatalogData: Codable {
                    let id: String?
                    let youtubeId: String?
                    let youtubeThumbnail: String?
                    let albumArt: String?
                    let resolvedAt: String?
                }
                struct DBTrack: Codable {
                    let id: String
                    let youtubeId: String
                    let title: String
                    let artist: String?
                    let thumbnail: String?
                    let songId: String?
                    let song: SongCatalogData?
                }
                struct DBPlaylist: Codable {
                    let tracks: [DBTrack]
                }
                struct DBResponse: Codable {
                    let playlist: DBPlaylist
                }
                let res = try await fetch(endpoint: "/api/playlists/\(playlistId)", responseType: DBResponse.self)
                self.currentPlaylistTracks = res.playlist.tracks.map { dbTrack in
                    // Prefer YouTube thumbnail from Song catalog > PlaylistTrack thumbnail > albumArt
                    let bestThumbnail = dbTrack.song?.youtubeThumbnail ?? dbTrack.thumbnail ?? dbTrack.song?.albumArt
                    let resolvedYoutubeId = dbTrack.song?.youtubeId ?? (dbTrack.youtubeId.isEmpty ? nil : dbTrack.youtubeId)
                    return Track(
                        id: dbTrack.id,
                        title: dbTrack.title,
                        artist: dbTrack.artist ?? "Unknown Artist",
                        thumbnail: bestThumbnail,
                        duration: nil,
                        youtubeId: resolvedYoutubeId,
                        songId: dbTrack.songId ?? dbTrack.song?.id
                    )
                }
                
                // Start background resolution for any unresolved tracks (Tier 2)
                let unresolved = self.currentPlaylistTracks.filter { !$0.isResolved && $0.songId != nil }
                if !unresolved.isEmpty {
                    Task.detached(priority: .background) { [weak self] in
                        await self?.resolveTracksInBackground(tracks: unresolved)
                    }
                }
            } else {
                struct ItemsResponse: Codable { let tracks: [Track] }
                let res = try await fetch(endpoint: "/youtube/playlistItems?playlistId=\(playlistId)", responseType: ItemsResponse.self)
                self.currentPlaylistTracks = res.tracks
            }
        } catch {
            self.error = error.localizedDescription
            print("Failed to fetch playlist items: \(error)")
        }
    }
    
    // MARK: - Client-Side YouTube Resolution (Tier 2)
    
    /// Scrapes YouTube search results using the user's own IP address to find a video ID and thumbnail.
    /// This is the Tier 2 resolution — runs client-side to avoid server IP bans.
    private func resolveTrackLocally(title: String, artist: String) async -> (youtubeId: String, thumbnail: String)? {
        let query = "\(artist) - \(title) official audio"
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let url = URL(string: "https://www.youtube.com/results?search_query=\(query)") else { return nil }
        
        var request = URLRequest(url: url)
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", forHTTPHeaderField: "User-Agent")
        request.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")
        request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")
        
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            guard let html = String(data: data, encoding: .utf8) else { return nil }
            
            // Extract the initial JSON data from YouTube's page
            guard let jsonStart = html.range(of: "var ytInitialData = "),
                  let jsonEnd = html.range(of: ";</script>", range: jsonStart.upperBound..<html.endIndex) else {
                return nil
            }
            
            let jsonStr = String(html[jsonStart.upperBound..<jsonEnd.lowerBound])
            guard let jsonData = jsonStr.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else { return nil }
            
            // Navigate the YouTube JSON to find the first video result
            if let contents = json["contents"] as? [String: Any],
               let twoColumnResults = contents["twoColumnSearchResultsRenderer"] as? [String: Any],
               let primaryContents = twoColumnResults["primaryContents"] as? [String: Any],
               let sectionList = primaryContents["sectionListRenderer"] as? [String: Any],
               let sections = sectionList["contents"] as? [[String: Any]] {
                
                for section in sections {
                    if let itemSection = section["itemSectionRenderer"] as? [String: Any],
                       let items = itemSection["contents"] as? [[String: Any]] {
                        for item in items {
                            if let videoRenderer = item["videoRenderer"] as? [String: Any],
                               let videoId = videoRenderer["videoId"] as? String {
                                let thumbnail = "https://img.youtube.com/vi/\(videoId)/hqdefault.jpg"
                                return (youtubeId: videoId, thumbnail: thumbnail)
                            }
                        }
                    }
                }
            }
        } catch {
            print("[Tier2] Local resolution failed for \"\(title)\": \(error)")
        }
        return nil
    }
    
    /// Background loop that resolves unresolved tracks using the user's device IP (Tier 2).
    /// If Tier 2 fails, falls back to the server (Tier 3) via the /resolve endpoint.
    private func resolveTracksInBackground(tracks: [Track]) async {
        for track in tracks {
            guard let songId = track.songId else { continue }
            
            // Small delay to avoid hammering YouTube too fast
            try? await Task.sleep(nanoseconds: 800_000_000) // 0.8s between requests
            
            // --- Tier 2: Client-side scraper ---
            if let result = await resolveTrackLocally(title: track.title, artist: track.artist) {
                print("[Tier2] ✅ Resolved \"\(track.title)\" → \(result.youtubeId)")
                await saveSongResolution(songId: songId, trackId: track.id, youtubeId: result.youtubeId, thumbnail: result.thumbnail)
                continue
            }
            
            // --- Tier 3: Server fallback ---
            print("[Tier3] Tier 2 failed for \"\(track.title)\", trying server fallback...")
            await post(endpoint: "/api/bridge/resolve", body: [
                "songId": songId,
                "trackId": track.id,
                "title": track.title,
                "artist": track.artist
            ])
        }
    }
    
    /// Sends the client-resolved YouTube ID back to the server to persist in the Song catalog.
    private func saveSongResolution(songId: String, trackId: String, youtubeId: String, thumbnail: String) async {
        guard let url = URL(string: "\(baseURL)/api/bridge/songs/\(songId)") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let appToken = AuthManager.shared.appToken {
            request.addValue("Bearer \(appToken)", forHTTPHeaderField: "Authorization")
        }
        let body: [String: Any] = ["youtubeId": youtubeId, "thumbnail": thumbnail, "trackId": trackId]
        if let data = try? JSONSerialization.data(withJSONObject: body) {
            request.httpBody = data
        }
        let (_, response) = (try? await URLSession.shared.data(for: request)) ?? (Data(), URLResponse())
        if let http = response as? HTTPURLResponse {
            print("[Tier2] Saved songId=\(songId) to server: HTTP \(http.statusCode)")
            // Update local track thumbnail/youtubeId in the published array so UI refreshes
            await MainActor.run {
                if let idx = self.currentPlaylistTracks.firstIndex(where: { $0.id == trackId }) {
                    self.currentPlaylistTracks[idx].youtubeId = youtubeId
                    self.currentPlaylistTracks[idx].thumbnail = thumbnail
                }
            }
        }
    }
    
    @MainActor
    func updatePlaylist(id: String, name: String, coverUrl: String) async throws {
        _ = try await put(endpoint: "/api/playlists/\(id)", body: [
            "name": name,
            "coverUrl": coverUrl
        ])
        await fetchLibrary() // Refresh list
    }
    
    @MainActor
    func deletePlaylist(id: String) async throws {
        _ = try await delete(endpoint: "/api/playlists/\(id)")
        await fetchLibrary() // Refresh list
    }
    
    @MainActor
    func deletePlaylistTrack(playlistId: String, trackId: String) async throws {
        _ = try await delete(endpoint: "/api/playlists/\(playlistId)/tracks/\(trackId)")
        // Refresh tracks
        await fetchPlaylistItems(playlistId: playlistId)
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
