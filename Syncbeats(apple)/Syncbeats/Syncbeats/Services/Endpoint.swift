import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Where the server lives. `.cloud` is api.syncbeats.in; `.lan` is a Local Edge
/// Node on the same network. This is the only place a base URL is spelled out —
/// APIClient, the socket and the bridge calls all read from here.
enum Transport: String, CaseIterable, Identifiable {
    case cloud
    case lan

    var id: String { rawValue }
    var label: String { self == .cloud ? "Cloud" : "LAN" }
    var symbol: String { self == .cloud ? "cloud.fill" : "wifi" }
}

enum Endpoint {
    private static let transportKey = "sb_transport"
    private static let lanHostKey   = "sb_lan_host"

    static let cloudURL = URL(string: "https://dev-api.syncbeats.app")!

    #if DEBUG
    private static let defaultTransport = Transport.lan
    #else
    private static let defaultTransport = Transport.cloud
    #endif

    static var transport: Transport {
        get {
            guard let raw = UserDefaults.standard.string(forKey: transportKey),
                  let t = Transport(rawValue: raw) else { return defaultTransport }
            return t
        }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: transportKey) }
    }

    /// host:port of the edge node. Typed in by hand until Bonjour discovery lands.
    static var lanHost: String {
        get { UserDefaults.standard.string(forKey: lanHostKey) ?? "127.0.0.1:4000" }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespaces), forKey: lanHostKey) }
    }

    static var baseURL: URL {
        switch transport {
        case .cloud: return cloudURL
        case .lan:   return URL(string: "http://\(lanHost)") ?? cloudURL
        }
    }

    /// Stable per-install id, sent as X-Device-Id and used on room:join.
    static var deviceId: String {
        if let existing = UserDefaults.standard.string(forKey: "sb_device_id") { return existing }
        let fresh = UUID().uuidString
        UserDefaults.standard.set(fresh, forKey: "sb_device_id")
        return fresh
    }

    static var token: String? { UserDefaults.standard.string(forKey: "sb_token") }

    /// Friendly name this device shows up as in the participant list.
    static var deviceName: String {
        #if os(macOS)
        return Host.current().localizedName ?? "Mac"
        #else
        return UIDevice.current.name
        #endif
    }
}
