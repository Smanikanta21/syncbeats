import Foundation
import Combine
import os

class NetworkManager: ObservableObject {
    static let shared = NetworkManager()
    private let baseURL = "http://localhost:4000"
    let logger = Logger(subsystem: "com.syncbeats.mac", category: "NetworkManager")
    
    @Published var authToken: String? {
        didSet {
            if let token = authToken {
                KeychainHelper.shared.save(token, service: "com.syncbeats.auth", account: "jwt")
            } else {
                KeychainHelper.shared.delete(service: "com.syncbeats.auth", account: "jwt")
            }
        }
    }
    
    @Published var userId: String? {
        didSet {
            if let uid = userId {
                KeychainHelper.shared.save(uid, service: "com.syncbeats.auth", account: "userId")
            } else {
                KeychainHelper.shared.delete(service: "com.syncbeats.auth", account: "userId")
            }
        }
    }
    
    @Published var userName: String? {
        didSet {
            if let uname = userName {
                KeychainHelper.shared.save(uname, service: "com.syncbeats.auth", account: "userName")
            } else {
                KeychainHelper.shared.delete(service: "com.syncbeats.auth", account: "userName")
            }
        }
    }
    
    var deviceId: String {
        if let storedId = UserDefaults.standard.string(forKey: "syncbeats_device_id") {
            return storedId
        }
        let newId = "NATIVE-MAC-\(UUID().uuidString)"
        UserDefaults.standard.set(newId, forKey: "syncbeats_device_id")
        return newId
    }
    
    init() {
        self.authToken = KeychainHelper.shared.readString(service: "com.syncbeats.auth", account: "jwt")
        self.userId = KeychainHelper.shared.readString(service: "com.syncbeats.auth", account: "userId")
        self.userName = KeychainHelper.shared.readString(service: "com.syncbeats.auth", account: "userName")
    }
    
    func logout() {
        DispatchQueue.main.async {
            self.authToken = nil
            self.userId = nil
            self.userName = nil
        }
    }
    
    func fetchRecentRooms(completion: @escaping ([String]) -> Void) {
        guard let token = authToken else {
            completion([])
            return
        }
        
        guard let url = URL(string: "\(baseURL)/rooms/mine") else {
            completion([])
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let data = data {
                do {
                    if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let rooms = json["rooms"] as? [[String: Any]] {
                        let roomIds = rooms.compactMap { $0["id"] as? String }
                        completion(roomIds)
                        return
                    }
                } catch {
                    self.logger.error("Failed to parse recent rooms: \(error.localizedDescription)")
                }
            }
            completion([])
        }.resume()
    }
    
    func verifySession(completion: @escaping (Bool) -> Void) {
        guard let token = authToken else {
            DispatchQueue.main.async { completion(false) }
            return
        }
        
        let url = URL(string: "\(baseURL)/auth/me")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200, let data = data {
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let user = json["user"] as? [String: Any] {
                    DispatchQueue.main.async {
                        self.userId = user["id"] as? String
                        self.userName = user["name"] as? String
                        self.logger.info("Session verified successfully.")
                        completion(true)
                    }
                } else {
                    DispatchQueue.main.async { completion(true) }
                }
            } else {
                DispatchQueue.main.async {
                    self.logger.info("Session invalid. Logging out.")
                    self.logout()
                    completion(false)
                }
            }
        }.resume()
    }
    
    func login(email: String, password: String, completion: @escaping (Bool, String?) -> Void) {
        let url = URL(string: "\(baseURL)/auth/login")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Send the native prefix device ID so the web frontend filters it out
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        request.setValue("SyncBeats Mac App", forHTTPHeaderField: "User-Agent")
        
        let body: [String: Any] = ["email": email, "password": password]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                DispatchQueue.main.async { completion(false, error.localizedDescription) }
                return
            }
            
            guard let data = data else {
                DispatchQueue.main.async { completion(false, "No data received") }
                return
            }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if let token = json["token"] as? String, let user = json["user"] as? [String: Any] {
                        DispatchQueue.main.async {
                            self.authToken = token
                            self.userId = user["id"] as? String
                            self.userName = user["name"] as? String
                            self.logger.info("Login successful. Device registered as \(self.deviceId)")
                            completion(true, nil)
                        }
                    } else {
                        let errorMsg = json["error"] as? String ?? "Invalid credentials"
                        DispatchQueue.main.async { completion(false, errorMsg) }
                    }
                }
            } catch {
                DispatchQueue.main.async { completion(false, "Failed to parse response") }
            }
        }.resume()
    }
    
    func signup(email: String, password: String, completion: @escaping (Bool, String?) -> Void) {
        let url = URL(string: "\(baseURL)/auth/signup")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(deviceId, forHTTPHeaderField: "x-device-id")
        request.setValue("SyncBeats Mac App", forHTTPHeaderField: "User-Agent")
        
        // Assuming your backend expects name as well. We'll send "Mac User" for now.
        let body: [String: Any] = ["email": email, "password": password, "name": "Mac User"]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                DispatchQueue.main.async { completion(false, error.localizedDescription) }
                return
            }
            
            guard let data = data else {
                DispatchQueue.main.async { completion(false, "No data received") }
                return
            }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    if let token = json["token"] as? String, let user = json["user"] as? [String: Any] {
                        DispatchQueue.main.async {
                            self.authToken = token
                            self.userId = user["id"] as? String
                            self.userName = user["name"] as? String
                            self.logger.info("Signup successful. Device registered as \(self.deviceId)")
                            completion(true, nil)
                        }
                    } else {
                        let errorMsg = json["error"] as? String ?? "Failed to create account"
                        DispatchQueue.main.async { completion(false, errorMsg) }
                    }
                }
            } catch {
                DispatchQueue.main.async { completion(false, "Failed to parse response") }
            }
        }.resume()
    }
}
