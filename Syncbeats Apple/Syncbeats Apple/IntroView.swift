import SwiftUI

struct IntroView: View {
    @EnvironmentObject var appState: AppState
    @State private var animateGradient = false
    
    var body: some View {
        ZStack {
            // Animated Background
            LinearGradient(
                colors: [Color(red: 0.1, green: 0, blue: 0.2), Theme.background, Color(red: 0, green: 0.1, blue: 0.2)],
                startPoint: animateGradient ? .topLeading : .bottomTrailing,
                endPoint: animateGradient ? .bottomTrailing : .topLeading
            )
            .ignoresSafeArea()
            .animation(.easeInOut(duration: 5.0).repeatForever(autoreverses: true), value: animateGradient)
            .onAppear {
                animateGradient.toggle()
            }
            
            VStack(spacing: 40) {
                Spacer()
                
                // Hero Content
                VStack(spacing: 16) {
                    Image(systemName: "waveform.circle.fill")
                        .resizable()
                        .frame(width: 100, height: 100)
                        .foregroundColor(Theme.foreground)
                        .shadow(color: Theme.accent.opacity(0.5), radius: 20, x: 0, y: 0)
                    
                    Text("SyncBeats")
                        .font(.system(size: 56, weight: .heavy, design: .rounded))
                        .foregroundColor(Theme.foreground)
                    
                    Text("Zero-latency audio syncing across all your devices.")
                        .font(.title3)
                        .foregroundColor(Theme.foreground.opacity(0.7))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .padding(.bottom, 20)
                
                // Actions
                VStack(spacing: 16) {
                    Button(action: {
                        withAnimation(.spring()) {
                            appState.currentScreen = .auth
                        }
                    }) {
                        Text("Get Started")
                            .font(.headline)
                            .foregroundColor(.black)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Theme.foreground)
                            .cornerRadius(12)
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    Button(action: {
                        // Action for Guest/Skip if needed later
                    }) {
                        Text("Learn More")
                            .font(.headline)
                            .foregroundColor(Theme.foreground.opacity(0.8))
                            .frame(maxWidth: .infinity)
                            .padding()
                            .glassPanel()
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                .frame(maxWidth: 300)
                
                Spacer()
            }
        }
    }
}

struct IntroView_Previews: PreviewProvider {
    static var previews: some View {
        IntroView()
            .environmentObject(AppState())
            .frame(width: 800, height: 600)
    }
}
