import Foundation

struct Account: Codable, Equatable, Sendable {
    let id: String
    let name: String
    let email: String
    let emailVerifiedAt: String?
    enum CodingKeys: String, CodingKey {
        case id, name, email
        case emailVerifiedAt = "email_verified_at"
    }
}

struct AuthSession: Codable, Sendable {
    let user: Account
    let token: String
    let defaultRoomId: String?
}

enum AuthFailure: Error, LocalizedError {
    case response(Int, String)
    case invalidResponse
    case invalidInput(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .response(let status, let message):
            if status >= 500 { return "SyncBeats is temporarily unavailable. Please try again." }
            if status == 429 { return "Too many attempts. Please wait a moment and try again." }
            return message.components(separatedBy: " [DEV_OTP:").first
        case .invalidResponse: return "We couldn't read the server response. Please try again."
        case .invalidInput(let message): return message
        case .cancelled: return "Sign-in was cancelled."
        }
    }

    var invalidatesSession: Bool {
        if case .response(let code, _) = self { return code == 401 || code == 403 }
        return false
    }
}

/// Uses the same JSON contracts as the web client. No automatic retries on writes.
struct AuthAPI {
    let baseURL: URL
    let deviceID: String
    let session: URLSession

    init(baseURL: URL = AppConfiguration.apiURL, deviceID: String, session: URLSession? = nil) {
        self.baseURL = baseURL
        self.deviceID = deviceID
        if let session { self.session = session }
        else {
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = 20
            config.timeoutIntervalForResource = 25
            config.httpShouldSetCookies = false
            self.session = URLSession(configuration: config)
        }
    }

    private struct ServerError: Decodable { let error: String? }
    private struct Ack: Decodable { let ok: Bool }
    private struct RoomResponse: Decodable { let roomId: String }

    private func request<T: Decodable>(_ path: String, method: String = "POST", body: [String: String]? = nil, token: String? = nil) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path), timeoutInterval: session.configuration.timeoutIntervalForRequest)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(deviceID, forHTTPHeaderField: "x-device-id")
        request.setValue("SyncBeats-Native/1.0", forHTTPHeaderField: "User-Agent")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await NativeDiagnostics.data(for: request, using: session,
            operation: NativeDiagnostics.operation(method: method, path: path))
        guard let response = response as? HTTPURLResponse else { throw AuthFailure.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONDecoder().decode(ServerError.self, from: data).error) ?? "The request couldn't be completed. Please try again."
            throw AuthFailure.response(response.statusCode, message)
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch {
            NativeDiagnostics.failure("HTTP", "Decode auth response", error: error)
            throw AuthFailure.invalidResponse
        }
    }

    func login(email: String, password: String) async throws -> AuthSession {
        try await request("auth/login", body: ["email": email, "password": password])
    }
    func register(name: String, email: String, password: String) async throws {
        let result: Ack = try await request("auth/register", body: ["name": name, "email": email, "password": password])
        guard result.ok else { throw AuthFailure.invalidResponse }
    }
    func google(credential: String) async throws -> AuthSession {
        try await request("auth/google", body: ["credential": credential])
    }
    func me(token: String) async throws -> AuthSession {
        try await request("auth/me", method: "GET", token: token)
    }
    func resendVerification(email: String) async throws {
        let result: Ack = try await request("auth/verification/resend", body: ["email": email])
        guard result.ok else { throw AuthFailure.invalidResponse }
    }
    func forgotPassword(email: String) async throws {
        let result: Ack = try await request("auth/password/forgot", body: ["email": email])
        guard result.ok else { throw AuthFailure.invalidResponse }
    }
    func resetPassword(email: String, otp: String, password: String) async throws {
        let result: Ack = try await request("auth/password/reset", body: ["email": email, "otp": otp, "password": password])
        guard result.ok else { throw AuthFailure.invalidResponse }
    }
    func room(token: String) async throws -> String {
        let response: RoomResponse = try await request("rooms/default", body: [:], token: token)
        return response.roomId
    }
}
