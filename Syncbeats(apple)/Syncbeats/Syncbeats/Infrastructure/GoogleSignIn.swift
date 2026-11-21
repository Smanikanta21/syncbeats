import Foundation
import AuthenticationServices
import CryptoKit
import Security
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct NativeGoogleGrant: Sendable { let code: String; let verifier: String }

/// The website verifies Google identity and returns a single-use PKCE handoff.
/// Custom-scheme callbacks work with Personal Teams; no Associated Domains required.
final class GoogleSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    static func randomToken() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw AuthFailure.invalidResponse }
        return base64URL(Data(bytes))
    }
    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    static func challenge(for verifier: String) -> String { base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) }
    static func authorizationURL(state: String, nonce: String, challenge: String) -> URL {
        var url = URLComponents(url: AppConfiguration.website.appendingPathComponent("auth/native"), resolvingAgainstBaseURL: false)!
        url.queryItems = [.init(name: "state", value: state), .init(name: "nonce", value: nonce), .init(name: "code_challenge", value: challenge)]
        return url.url!
    }
    static func code(from callback: URL, state: String) throws -> String {
        guard callback.scheme == "syncbeats", callback.host == "google", callback.path == "/callback", callback.port == nil,
              callback.user == nil, callback.password == nil, callback.fragment == nil,
              let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false) else { throw AuthFailure.invalidResponse }
        let values = parts.queryItems ?? []
        guard values.filter({ $0.name == "state" }).count == 1,
              values.first(where: { $0.name == "state" })?.value == state,
              values.filter({ $0.name == "code" }).count == 1,
              let code = values.first(where: { $0.name == "code" })?.value,
              code.range(of: #"^[A-Za-z0-9_-]{43}$"#, options: .regularExpression) != nil else {
            throw AuthFailure.invalidInput("The Google sign-in request expired. Please try again.")
        }
        return code
    }
    func signIn() async throws -> NativeGoogleGrant {
        let verifier = try Self.randomToken(), state = try Self.randomToken(), nonce = try Self.randomToken()
        return try await withCheckedThrowingContinuation { continuation in
            let browser = ASWebAuthenticationSession(url: Self.authorizationURL(state: state, nonce: nonce, challenge: Self.challenge(for: verifier)), callbackURLScheme: "syncbeats") { [weak self] callback, error in
                Task { @MainActor in
                    self?.session = nil
                    if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin { continuation.resume(throwing: AuthFailure.cancelled); return }
                    do {
                        guard let callback else { throw AuthFailure.invalidInput("Couldn't finish Google sign-in. Please try again.") }
                        continuation.resume(returning: NativeGoogleGrant(code: try Self.code(from: callback, state: state), verifier: verifier))
                    } catch { continuation.resume(throwing: error) }
                }
            }
            browser.presentationContextProvider = self
            browser.prefersEphemeralWebBrowserSession = true
            session = browser
            if !browser.start() { session = nil; continuation.resume(throwing: AuthFailure.invalidInput("Couldn't open the secure sign-in browser.")) }
        }
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        #if os(macOS)
        return NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? NSWindow()
        #else
        return UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? UIWindow()
        #endif
    }
}
