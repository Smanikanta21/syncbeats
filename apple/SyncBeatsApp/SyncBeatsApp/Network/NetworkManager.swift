import Foundation

class NetworkManager {
    static let shared = NetworkManager()
    private let baseURL = "http://192.168.29.61:4000"
    
    private init() {}
    
    private func createRequest(path: String, method: String, body: Data? = nil, requiresAuth: Bool = true) -> URLRequest? {
        guard let url = URL(string: "\(baseURL)\(path)") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if requiresAuth, let token = SessionManager.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue(SessionManager.shared.deviceId, forHTTPHeaderField: "x-device-id")
        }
        if let body = body {
            request.httpBody = body
        }
        return request
    }
    
    func login(requestData: LoginRequest, completion: @escaping (Result<AuthResponse, Error>) -> Void) {
        guard let body = try? JSONEncoder().encode(requestData) else { return }
        guard let request = createRequest(path: "/auth/login", method: "POST", body: body, requiresAuth: false) else { return }
        performRequest(request: request, completion: completion)
    }
    
    func register(requestData: RegisterRequest, completion: @escaping (Result<AuthResponse, Error>) -> Void) {
        guard let body = try? JSONEncoder().encode(requestData) else { return }
        guard let request = createRequest(path: "/auth/register", method: "POST", body: body, requiresAuth: false) else { return }
        performRequest(request: request, completion: completion)
    }
    
    func search(query: String, completion: @escaping (Result<SearchResponse, Error>) -> Void) {
        let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        guard let request = createRequest(path: "/search/youtube?q=\(encodedQuery)", method: "GET") else { return }
        performRequest(request: request, completion: completion)
    }
    
    func getDevices(completion: @escaping (Result<DevicesResponse, Error>) -> Void) {
        guard let request = createRequest(path: "/devices/mine", method: "GET") else { return }
        performRequest(request: request, completion: completion)
    }
    
    private func performRequest<T: Codable>(request: URLRequest, completion: @escaping (Result<T, Error>) -> Void) {
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                DispatchQueue.main.async { completion(.failure(error)) }
                return
            }
            guard let data = data else {
                DispatchQueue.main.async { completion(.failure(NSError(domain: "", code: -1, userInfo: nil))) }
                return
            }
            do {
                let decodedData = try JSONDecoder().decode(T.self, from: data)
                DispatchQueue.main.async { completion(.success(decodedData)) }
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }.resume()
    }
}
