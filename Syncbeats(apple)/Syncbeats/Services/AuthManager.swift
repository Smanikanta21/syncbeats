import Foundation
import Combine

@MainActor
class AuthManager: ObservableObject {
    static let shared = AuthManager()
    
    @Published var currentUser: User?
    @Published var isAuthenticated: Bool = false
    @Published var isLoading: Bool = false
    @Published var authError: String?
    
    private init() {
        checkAuthStatus()
    }
    
    func checkAuthStatus() {
        if let _ = UserDefaults.standard.string(forKey: "sb_token") {
            // Ideally we'd call /auth/me here to validate the token and get the user object
            self.isAuthenticated = true
        } else {
            self.isAuthenticated = false
        }
    }
    
    func login(email: String, password: String) async {
        isLoading = true
        authError = nil
        
        do {
            let body = try JSONSerialization.data(withJSONObject: [
                "email": email,
                "password": password
            ])
            
            let response: AuthResponse = try await APIClient.shared.request(
                path: "/auth/login",
                method: "POST",
                body: body
            )
            
            // Save token
            UserDefaults.standard.set(response.token, forKey: "sb_token")
            
            self.currentUser = response.user
            self.isAuthenticated = true
            
        } catch {
            self.authError = error.localizedDescription
            self.isAuthenticated = false
        }
        
        isLoading = false
    }
    
    func logout() {
        UserDefaults.standard.removeObject(forKey: "sb_token")
        self.currentUser = nil
        self.isAuthenticated = false
    }
}
