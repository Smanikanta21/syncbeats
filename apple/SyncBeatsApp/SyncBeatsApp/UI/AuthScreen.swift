import SwiftUI

struct AuthScreen: View {
    @EnvironmentObject var appState: AppState
    @State private var isLogin = true
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var errorMessage: String?
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text(isLogin ? "Welcome Back" : "Create Account").font(.largeTitle).fontWeight(.bold)
                if !isLogin {
                    TextField("Name", text: $name).textFieldStyle(RoundedBorderTextFieldStyle()).autocapitalization(.words)
                }
                TextField("Email", text: $email).textFieldStyle(RoundedBorderTextFieldStyle()).keyboardType(.emailAddress).autocapitalization(.none)
                SecureField("Password", text: $password).textFieldStyle(RoundedBorderTextFieldStyle())
                if let error = errorMessage { Text(error).foregroundColor(.red).font(.caption) }
                Button(action: handleAuth) {
                    Text(isLogin ? "Login" : "Sign Up").foregroundColor(.white).frame(maxWidth: .infinity).padding().background(Color.blue).cornerRadius(10)
                }
                Button(action: { isLogin.toggle() }) {
                    Text(isLogin ? "Don't have an account? Sign Up" : "Already have an account? Login").foregroundColor(.blue)
                }
                Spacer()
            }.padding().navigationBarHidden(true)
        }
    }
    
    private func handleAuth() {
        errorMessage = nil
        if isLogin {
            NetworkManager.shared.login(requestData: LoginRequest(email: email, password: password)) { result in
                handleResult(result: result)
            }
        } else {
            NetworkManager.shared.register(requestData: RegisterRequest(name: name, email: email, password: password)) { result in
                handleResult(result: result)
            }
        }
    }
    
    private func handleResult(result: Result<AuthResponse, Error>) {
        switch result {
        case .success(let response):
            if let token = response.token { appState.login(user: response.user, token: token) }
            else { self.errorMessage = response.error ?? "Authentication failed" }
        case .failure(let error):
            self.errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    AuthScreen()
        .environmentObject(AppState())
}
