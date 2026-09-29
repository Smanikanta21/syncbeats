import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case serverError(statusCode: Int, message: String)
    case decodingError(Error)
    case unknown

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL."
        case .serverError(_, let message): return message
        case .decodingError(let error): return "Unexpected response from the server. \(error.localizedDescription)"
        case .unknown: return "An unknown error occurred."
        }
    }

    var isUnauthorized: Bool {
        if case .serverError(let code, _) = self { return code == 401 || code == 403 }
        return false
    }
}

/// Decode target for endpoints whose body we don't care about.
struct EmptyResponse: Decodable {}

final class APIClient {
    static let shared = APIClient()
    private init() {}

    /// Always read through Endpoint so LAN/Cloud switching is one setting, not
    /// a URL scattered across call sites.
    var baseURL: URL { Endpoint.baseURL }

    func request<T: Decodable>(
        path: String,
        method: String = "GET",
        body: Data? = nil,
        requiresAuth: Bool = false
    ) async throws -> T {
        // Not appendingPathComponent: that percent-encodes query strings.
        guard let url = URL(string: baseURL.absoluteString + path) else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Endpoint.deviceId, forHTTPHeaderField: "X-Device-Id")
        request.httpBody = body

        if requiresAuth, let token = Endpoint.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.unknown }

        guard (200...299).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(APIErrorResponse.self, from: data))?.error
                ?? "HTTP \(http.statusCode)"
            throw APIError.serverError(statusCode: http.statusCode, message: message)
        }

        // 204 and other empty bodies still have to satisfy the generic.
        if data.isEmpty, let empty = EmptyResponse() as? T { return empty }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Convenience for the JSON-body case, so callers stop hand-rolling
    /// JSONSerialization + URLRequest.
    func request<T: Decodable>(
        path: String,
        method: String = "POST",
        json: [String: Any],
        requiresAuth: Bool = false
    ) async throws -> T {
        try await request(
            path: path,
            method: method,
            body: try JSONSerialization.data(withJSONObject: json),
            requiresAuth: requiresAuth
        )
    }
}
