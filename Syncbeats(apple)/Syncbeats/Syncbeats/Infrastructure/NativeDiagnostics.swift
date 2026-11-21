import Foundation
import OSLog

/// Log operation metadata only: never headers, payloads, query strings or media URLs.
enum NativeDiagnostics {
    private static let logger = Logger(subsystem: "in.syncbeats.native", category: "Lifecycle")

    static func info(_ category: String, _ message: String) {
        write(category, message, failed: false)
    }

    static func failure(_ category: String, _ operation: String, error: Error) {
        write(category, "\(operation) failed (\(errorCode(error)))", failed: true)
    }

    private static func write(_ category: String, _ message: String, failed: Bool) {
        let line = "[SyncBeats][\(category)] \(message)"
        if failed { logger.error("\(line, privacy: .public)") }
        else { logger.notice("\(line, privacy: .public)") }
        #if DEBUG
        // stderr also reaches Xcode when unified logging is hidden or filtered.
        FileHandle.standardError.write(Data((line + "\n").utf8))
        #endif
    }

    static func started(endpoint: URL) {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "development"
        let host = endpoint.host ?? "unknown"
        let port = endpoint.port.map { ":\($0)" } ?? ""
        info("App", "Started v\(version); API \(endpoint.scheme ?? "https")://\(host)\(port)")
    }

    static func data(for request: URLRequest, using session: URLSession, operation: String) async throws -> (Data, URLResponse) {
        let started = ProcessInfo.processInfo.systemUptime
        info("HTTP", "\(operation) started")
        do {
            let result = try await session.data(for: request)
            let elapsed = Int((ProcessInfo.processInfo.systemUptime - started) * 1000)
            let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
            write("HTTP", "\(operation) → \(status) (\(elapsed) ms)", failed: !(200..<300).contains(status))
            return result
        } catch {
            failure("HTTP", operation, error: error)
            throw error
        }
    }

    /// Keep only known API route segments; IDs and unrecognized segments are redacted.
    static func operation(method: String, path: String) -> String {
        let known = Set(["api", "auth", "login", "register", "google", "me", "verification", "resend",
                         "password", "forgot", "reset", "rooms", "default", "youtube-search", "enqueue-youtube",
                         "queue", "reorder", "recommendations", "catalog", "profile", "feed", "events", "history", "recent", "search"])
        let route = path.split(separator: "/").map { known.contains(String($0)) ? String($0) : ":id" }.joined(separator: "/")
        return "\(method) /\(route)"
    }

    private static func errorCode(_ error: Error) -> String {
        if error is CancellationError { return "cancelled" }
        if let error = error as? URLError { return "URL error \(error.code.rawValue)" }
        if let error = error as? AuthFailure {
            switch error {
            case .response(let status, _): return "HTTP \(status)"
            case .invalidResponse: return "invalid response"
            case .invalidInput: return "invalid input"
            case .cancelled: return "cancelled"
            }
        }
        if error is DecodingError { return "decode error" }
        let error = error as NSError
        let knownDomains = Set([NSOSStatusErrorDomain, NSCocoaErrorDomain, NSPOSIXErrorDomain])
        return "\(knownDomains.contains(error.domain) ? error.domain : "system error") \(error.code)"
    }
}
