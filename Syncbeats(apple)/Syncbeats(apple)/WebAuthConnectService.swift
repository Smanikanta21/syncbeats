import Foundation
import AuthenticationServices

/// Signs the user in by tunnelling through the SyncBeats **website** login,
/// then receiving the app's own JWT back via a `syncbeats://` deep link.
///
/// Why not talk to Google directly? Google rejects native OAuth (custom-scheme
/// redirect + implicit flow) against a *Web* OAuth client, which is what the
/// server's `GOOGLE_CLIENT_ID` is. The website already performs Google login
/// against that same client from an authorized `https://` origin, so we reuse
/// it. This mirrors the existing iOS/Android handoff:
///
///   1. Open `https://<site>/login?returnTo=syncbeats://auth` in a secure
///      web session.
///   2. User logs in on the website (Google or email/password — either works).
///   3. The site redirects to `syncbeats://auth?token=<jwt>`.
///   4. We parse the token; `AuthStore` stores it and calls `/auth/me`.
///
/// No new Google client, no server change: the app only ever receives its own
/// SyncBeats JWT, never a Google token.
enum WebAuthError: Error, Equatable {
    case cancelled
    case noToken
    case underlying(String)

    var displayText: String {
        switch self {
        case .cancelled:         return "Sign-in was cancelled."
        case .noToken:           return "Login didn’t return a token. Please try again."
        case .underlying(let m): return m
        }
    }
}

final class WebAuthConnectService: NSObject {
    static let shared = WebAuthConnectService()

    private enum Config {
        /// Public website origin that hosts the login page. In local dev point
        /// this at the Next.js server (e.g. "http://localhost:3000").
        static let siteURL = "https://syncbeats.app"
        /// Custom scheme registered in Info.plist (CFBundleURLTypes).
        static let callbackScheme = "syncbeats"
        /// Deep link the website redirects back to, carrying `?token=<jwt>`.
        static let returnTo = "syncbeats://auth"
    }

    private var session: ASWebAuthenticationSession?

    /// Runs the interactive browser flow and returns the SyncBeats JWT.
    @MainActor
    func requestToken() async throws -> String {
        var components = URLComponents(string: "\(Config.siteURL)/login")!
        components.queryItems = [
            .init(name: "returnTo", value: Config.returnTo)
        ]
        guard let authURL = components.url else {
            throw WebAuthError.underlying("Couldn’t build the login URL.")
        }

        let callbackURL: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: Config.callbackScheme
            ) { url, error in
                if let error {
                    if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin {
                        continuation.resume(throwing: WebAuthError.cancelled)
                    } else {
                        continuation.resume(throwing: WebAuthError.underlying(error.localizedDescription))
                    }
                    return
                }
                guard let url else {
                    continuation.resume(throwing: WebAuthError.noToken)
                    return
                }
                continuation.resume(returning: url)
            }
            session.presentationContextProvider = self
            // Use the shared session so an already-logged-in website skips
            // re-entering credentials.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                continuation.resume(throwing: WebAuthError.underlying("Couldn’t start the login session."))
            }
        }

        guard let token = Self.token(from: callbackURL) else {
            throw WebAuthError.noToken
        }
        return token
    }

    /// Extract `token` from the callback, tolerating both query and fragment
    /// (`syncbeats://auth?token=...`).
    private static func token(from url: URL) -> String? {
        if let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let value = comps.queryItems?.first(where: { $0.name == "token" })?.value,
           !value.isEmpty {
            return value
        }
        if let fragment = url.fragment {
            for pair in fragment.split(separator: "&") {
                let kv = pair.split(separator: "=", maxSplits: 1)
                if kv.count == 2, kv[0] == "token" {
                    return String(kv[1]).removingPercentEncoding
                }
            }
        }
        return nil
    }
}

extension WebAuthConnectService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApplication.shared.keyWindow ?? ASPresentationAnchor()
    }
}
