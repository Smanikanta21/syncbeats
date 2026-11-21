import Foundation

/// Native API selection. Google authorization is configured by the website.
enum AppConfiguration {
    static let productionAPI = URL(string: "https://api.syncbeats.in")!
    // Beta testers and ordinary Xcode runs use the live service.
    static var defaultAPI: URL { productionAPI }
    static let website = URL(string: "https://syncbeats.in")!
    static var apiURL: URL {
        #if DEBUG
        guard let raw = ProcessInfo.processInfo.environment["SYNCBEATS_API_URL"],
              let url = URL(string: raw), url.user == nil, url.password == nil,
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host ?? ""))
        else { return defaultAPI }
        return url
        #else
        return productionAPI
        #endif
    }
}
