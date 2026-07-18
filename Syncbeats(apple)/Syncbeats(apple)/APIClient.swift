import Foundation

enum APIError: Error {
    case invalidURL
    case noData
    case httpError(statusCode: Int, message: String)
    case decodingError
}

class APIClient {
    static let shared = APIClient()
    var baseURL = "http://localhost:4000"
    
    // JWT token to inject into Authorization header
    var token: String? = nil
    
    func setAuthToken(_ token: String?) {
        self.token = token
    }
    
    // MARK: - Core HTTP Request Builder
    private func makeRequest(path: String, method: String, body: Data? = nil) async throws -> Data {
        guard let url = URL(string: "\(baseURL)\(path)") else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(DeviceIdentity.shared.id, forHTTPHeaderField: "X-Device-Id")
        
        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = body
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.noData
        }
        
        if !(200...299).contains(httpResponse.statusCode) {
            let errorMsg = String(data: data, encoding: .utf8) ?? "HTTP Error"
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: errorMsg)
        }
        
        return data
    }
    
    // MARK: - API Methods
    func get<T: Decodable>(path: String) async throws -> T {
        let data = try await makeRequest(path: path, method: "GET")
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            print("[APIClient] decoding error for path \(path):", error)
            throw APIError.decodingError
        }
    }
    
    func post<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        let bodyData = try JSONEncoder().encode(body)
        let data = try await makeRequest(path: path, method: "POST", body: bodyData)
        return try JSONDecoder().decode(T.self, from: data)
    }
    
    func postNoResponse<B: Encodable>(path: String, body: B) async throws {
        let bodyData = try JSONEncoder().encode(body)
        _ = try await makeRequest(path: path, method: "POST", body: bodyData)
    }
    
    func patch<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        let bodyData = try JSONEncoder().encode(body)
        let data = try await makeRequest(path: path, method: "PATCH", body: bodyData)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
