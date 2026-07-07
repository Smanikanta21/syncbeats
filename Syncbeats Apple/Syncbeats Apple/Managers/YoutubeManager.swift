import Foundation
import AuthenticationServices
import Combine

struct YouTubePlaylist: Identifiable, Codable {
    let id: String
    let title: String
    let thumbnail: String?
    let itemCount: Int?
}

struct YouTubeTrack: Identifiable, Codable {
    let id: String
    let title: String
    let artist: String
    let thumbnail: String?
}

class YoutubeManager: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var isAuthenticated = false
    @Published var playlists: [YouTubePlaylist] = []
    
    private var authSession: ASWebAuthenticationSession?
    
    private var accessToken: String? {
        didSet {
            isAuthenticated = (accessToken != nil)
            if isAuthenticated {
                fetchLibrary()
            }
        }
    }
    
    private let backendUrl = "http://localhost:4000"
    
    override init() {
        super.init()
        // Try to load token from UserDefaults
        if let token = UserDefaults.standard.string(forKey: "yt_access_token") {
            self.accessToken = token
        }
    }
    
    func signIn() {
        guard let authUrl = URL(string: "\(backendUrl)/youtube/auth?redirect=syncbeats://auth") else { return }
        
        let scheme = "syncbeats"
        
        authSession = ASWebAuthenticationSession(url: authUrl, callbackURLScheme: scheme) { callbackURL, error in
            if let error = error {
                print("ASWebAuthenticationSession Error: \(error)")
                return
            }
            
            guard let callbackURL = callbackURL,
                  let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: true),
                  let fragment = components.fragment else {
                print("Invalid callback URL")
                return
            }
            
            // Parse fragment: access_token=XXX&refresh_token=YYY
            let params = fragment.components(separatedBy: "&").reduce(into: [String: String]()) { result, param in
                let parts = param.components(separatedBy: "=")
                if parts.count == 2 {
                    result[parts[0]] = parts[1]
                }
            }
            
            if let token = params["access_token"] {
                DispatchQueue.main.async {
                    self.accessToken = token
                    UserDefaults.standard.set(token, forKey: "yt_access_token")
                }
            }
        }
        
        authSession?.presentationContextProvider = self
        authSession?.prefersEphemeralWebBrowserSession = false 
        authSession?.start()
    }
    
    func signOut() {
        accessToken = nil
        playlists = []
        UserDefaults.standard.removeObject(forKey: "yt_access_token")
    }
    
    func fetchLibrary() {
        guard let token = accessToken, let url = URL(string: "\(backendUrl)/youtube/library") else { return }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("Failed to fetch library: \(error)")
                return
            }
            guard let data = data else { return }
            
            struct LibraryResponse: Codable {
                let playlists: [YouTubePlaylist]?
                let error: String?
            }
            
            if let res = try? JSONDecoder().decode(LibraryResponse.self, from: data), let lists = res.playlists {
                DispatchQueue.main.async {
                    self.playlists = lists
                }
            } else {
                print("Failed to decode library response", String(data: data, encoding: .utf8) ?? "")
            }
        }.resume()
    }
    
    // Required by ASWebAuthenticationPresentationContextProviding
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return NSApplication.shared.windows.first ?? ASPresentationAnchor()
    }
}
