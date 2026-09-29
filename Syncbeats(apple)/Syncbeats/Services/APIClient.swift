import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case networkError(Error)
    case serverError(statusCode: Int, message: String)
    case decodingError(Error)
    case unknown
    
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL."
        case .networkError(let error): return "Network error: \(error.localizedDescription)"
        case .serverError(_, let message): return message
        case .decodingError(let error): return "Failed to decode response: \(error.localizedDescription)"
        case .unknown: return "An unknown error occurred."
        }
    }
}

class APIClient {
    static let shared = APIClient()
    
    // Defaulting to local dev server for now. In production, this would be https://api.syncbeats.in
    var baseURL = URL(string: "http://localhost:4000")!
    
    private init() {}
    
    func request<T: Decodable>(
        path: String,
        method: String = "GET",
        body: Data? = nil,
        requiresAuth: Bool = false
    ) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let deviceId = UserDefaults.standard.string(forKey: "sb_device_id") {
            request.setValue(deviceId, forHTTPHeaderField: "X-Device-Id")
        } else {
            let newDeviceId = UUID().uuidString
            UserDefaults.standard.set(newDeviceId, forKey: "sb_device_id")
            request.setValue(newDeviceId, forHTTPHeaderField: "X-Device-Id")
        }
        
        if requiresAuth, let token = UserDefaults.standard.string(forKey: "sb_token") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        request.httpBody = body
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown
        }
        
        if !(200...299).contains(httpResponse.statusCode) {
            let errorMsg: String
            if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
                errorMsg = errorResponse.error
            } else {
                errorMsg = "HTTP \(httpResponse.statusCode)"
            }
            throw APIError.serverError(statusCode: httpResponse.statusCode, message: errorMsg)
        }
        
        do {
            let decodedResponse = try JSONDecoder().decode(T.self, from: data)
            return decodedResponse
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
