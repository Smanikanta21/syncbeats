import Foundation

/// Public web OAuth client ID shared with the current SyncBeats backend.
/// No client secret is bundled. A development override can be supplied at launch.
enum AppConfiguration {
    /// Debug omits the paid-team capability; Release includes the website association.
    static var associatedDomainsEnabled: Bool {
        #if SYNCBEATS_ASSOCIATED_DOMAINS
        return true
        #else
        return false
        #endif
    }
    static let productionAPI = URL(string: "https://api.syncbeats.in")!
    static var defaultAPI: URL {
        #if DEBUG
        return URL(string: "http://localhost:4000")!
        #else
        return productionAPI
        #endif
    }
    static let website = URL(string: "https://syncbeats.in")!
    static let googleClientID = ProcessInfo.processInfo.environment["SYNCBEATS_GOOGLE_CLIENT_ID"] ?? "1006171035854-cacohriuvvgpb7mu8q11iro8oq2dj2o1.apps.googleusercontent.com"
    static var apiURL: URL {
        guard let raw = ProcessInfo.processInfo.environment["SYNCBEATS_API_URL"],
              let url = URL(string: raw), url.user == nil, url.password == nil,
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host ?? ""))
        else { return defaultAPI }
        return url
    }
}
