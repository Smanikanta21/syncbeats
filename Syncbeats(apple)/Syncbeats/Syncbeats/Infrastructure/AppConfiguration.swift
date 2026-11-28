import Foundation

/// Native API selection. Google authorization is configured by the website.
enum AppConfiguration {
    static let defaultAPI = URL(string: "https://api.syncbeats.in")!
    static let defaultWebsite = URL(string: "https://syncbeats.in")!

    static var apiURL: URL { overrideURL("SYNCBEATS_API_URL") ?? defaultAPI }
    static var website: URL { overrideURL("SYNCBEATS_WEBSITE_URL") ?? defaultWebsite }

    private static func overrideURL(_ key: String) -> URL? {
        #if DEBUG
        guard let raw = ProcessInfo.processInfo.environment[key], let url = URL(string: raw),
              let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(host))
        else { return nil }
        return url
        #else
        return nil
        #endif
    }
}
