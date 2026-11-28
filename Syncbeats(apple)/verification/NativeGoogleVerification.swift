import Foundation

private final class GoogleHTTPFixture: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var status = 200
    nonisolated(unsafe) static var body: [String: String] = [:]
    nonisolated(unsafe) static var device: String?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "google-fixture.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.device = request.value(forHTTPHeaderField: "x-device-id")
        var data = request.httpBody
        if data == nil, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var bytes = [UInt8](repeating: 0, count: 1024), collected = Data()
            while stream.hasBytesAvailable { let count = stream.read(&bytes, maxLength: bytes.count); if count <= 0 { break }; collected.append(contentsOf: bytes.prefix(count)) }
            data = collected
        }
        if let data { Self.body = (try? JSONSerialization.jsonObject(with: data)) as? [String: String] ?? [:] }
        let object: [String: Any] = Self.status != 200 ? ["error": "Sign-in expired"] : request.url!.path.hasSuffix("/exchange")
            ? ["user": ["id": "fixture-user", "name": "Fixture", "email": "fixture@example.invalid"], "token": "fictional-session"] : ["version": 1]
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: object)); client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main struct NativeGoogleVerification {
    @MainActor static func main() async throws {
        var count = 0
        func check(_ condition: Bool, _ message: String) { precondition(condition, message); count += 1; print("PASS: " + message) }
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        check(GoogleSignIn.challenge(for: verifier) == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "PKCE matches the RFC 7636 vector")
        let state = try GoogleSignIn.randomToken(), nonce = try GoogleSignIn.randomToken()
        check(state.count == 43 && state != nonce, "Random session bindings have independent 256-bit entropy")
        let url = GoogleSignIn.authorizationURL(state: state, nonce: nonce, challenge: GoogleSignIn.challenge(for: verifier))
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!
        check(url.scheme == "https" && url.host == AppConfiguration.website.host &&
              url.port == AppConfiguration.website.port && url.path == "/auth/native", "Sign-in opens the configured website over HTTPS")
        check(items.first { $0.name == "code_challenge" }?.value == GoogleSignIn.challenge(for: verifier) && !url.absoluteString.contains(verifier), "The private verifier never leaves the Mac during authorization")
        let code = String(repeating: "a", count: 43)
        let callback = "syncbeats://google/callback?state=\(state)&code=\(code)"
        let decoded = try GoogleSignIn.code(from: URL(string: callback)!, state: state)
        check(decoded == code, "The custom callback returns only a handoff code")
        for invalid in [callback.replacingOccurrences(of: state, with: "wrong"), callback.replacingOccurrences(of: "syncbeats:", with: "https:"), callback.replacingOccurrences(of: "/callback", with: "/other"), callback + "&state=" + state, callback + "&code=" + code, callback + "#id_token=fictional", callback.replacingOccurrences(of: code, with: "not-a-code")] {
            var rejected = false
            do { _ = try GoogleSignIn.code(from: URL(string: invalid)!, state: state) } catch { rejected = true }
            check(rejected, "Malformed or unrelated callbacks are rejected")
        }
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [GoogleHTTPFixture.self]
        let api = AuthAPI(baseURL: URL(string: "https://google-fixture.invalid")!, deviceID: "native-google-fixture", session: URLSession(configuration: config))
        try await api.nativeGoogleAvailable(); check(true, "Native auth capability uses the backend contract")
        let session = try await api.nativeGoogle(code: code, verifier: verifier)
        check(session.user.id == "fixture-user" && session.token == "fictional-session", "The handoff exchanges for the existing account session")
        check(GoogleHTTPFixture.body == ["code": code, "verifier": verifier] && GoogleHTTPFixture.device == "native-google-fixture", "The exchange sends proof and the Mac device identity")
        GoogleHTTPFixture.status = 404
        var helpful = false
        do { try await api.nativeGoogleAvailable() } catch { helpful = error.localizedDescription.contains("updated SyncBeats server") }
        check(helpful, "Older servers show an actionable update message")
        print("\(count) native Google checks passed; no Google account was contacted.")
    }
}
