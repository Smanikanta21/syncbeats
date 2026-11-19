import Foundation
import AuthenticationServices
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Uses the existing Google web client and registered https://syncbeats.in redirect.
/// HTTPS callbacks require the website's webcredentials association to be deployed.
final class GoogleSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    static func authorizationURL(clientID: String, state: String, nonce: String) -> URL {
        var url = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        url.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: AppConfiguration.website.absoluteString),
            URLQueryItem(name: "response_type", value: "id_token"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "prompt", value: "select_account"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce)
        ]
        return url.url!
    }

    static func credential(from callback: URL, state: String, nonce: String) throws -> String {
        guard callback.scheme == "https", callback.host == AppConfiguration.website.host,
              callback.path.isEmpty || callback.path == "/",
              let fragment = callback.fragment,
              let items = URLComponents(string: "https://callback.invalid/?" + fragment)?.queryItems else {
            throw AuthFailure.invalidInput("Google couldn't complete sign-in. Please try again.")
        }
        let values = Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { first, _ in first })
        guard values["state"] == state, let credential = values["id_token"] else {
            throw AuthFailure.invalidInput("Google returned an unexpected sign-in response. Please try again.")
        }
        let segments = credential.split(separator: ".")
        guard segments.count == 3 else { throw AuthFailure.invalidResponse }
        var base64 = String(segments[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        guard let data = Data(base64Encoded: base64),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              payload["nonce"] as? String == nonce else {
            throw AuthFailure.invalidInput("The Google sign-in request expired. Please try again.")
        }
        // The backend verifies signature, audience, and expiry before issuing an app session.
        return credential
    }

    func signIn() async throws -> String {
        guard AppConfiguration.associatedDomainsEnabled else {
            throw AuthFailure.invalidInput("Google sign-in is unavailable in this development build. Please use email login or create an account.")
        }
        let state = UUID().uuidString
        let nonce = UUID().uuidString
        return try await withCheckedThrowingContinuation { continuation in
            let auth = ASWebAuthenticationSession(
                url: Self.authorizationURL(clientID: AppConfiguration.googleClientID, state: state, nonce: nonce),
                callback: .https(host: AppConfiguration.website.host!, path: "/")
            ) { [weak self] callback, error in
                Task { @MainActor in
                    self?.session = nil
                    if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                        continuation.resume(throwing: AuthFailure.cancelled)
                    } else if let callback {
                        do { continuation.resume(returning: try Self.credential(from: callback, state: state, nonce: nonce)) }
                        catch { continuation.resume(throwing: error) }
                    } else {
                        continuation.resume(throwing: AuthFailure.invalidInput("Couldn't open Google sign-in. Please try again."))
                    }
                }
            }
            auth.presentationContextProvider = self
            self.session = auth
            if !auth.start() {
                self.session = nil
                continuation.resume(throwing: AuthFailure.invalidInput("Couldn't open the secure sign-in browser."))
            }
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
