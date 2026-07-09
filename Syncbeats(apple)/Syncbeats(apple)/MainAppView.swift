import SwiftUI

struct MainAppView: View {
    @ObservedObject var auth = AuthManager.shared
    @StateObject private var socket = SocketService.shared
    @StateObject private var ytService = YouTubeService.shared
    
    @State private var showSyncBeatsModal = false
    @State private var selection: String? = "home"
    
    // Website Gradient Colors
    let colorCyan = Color(red: 0.0, green: 1.0, blue: 0.7)    // #00FFB2
    let colorPurple = Color(red: 0.48, green: 0.38, blue: 1.0) // #7B61FF
    let colorPink = Color(red: 1.0, green: 0.24, blue: 0.44)   // #FF3D71
    
    var body: some View {
        NavigationSplitView {
            // Sidebar
            List(selection: $selection) {
                NavigationLink(value: "home") {
                    Label("Home", systemImage: "house")
                }
                NavigationLink(value: "library") {
                    Label("Library", systemImage: "music.note.list")
                }
                NavigationLink(value: "rooms") {
                    Label("Active Rooms", systemImage: "hifispeaker.2")
                }
            }
            .navigationTitle("SyncBeats")
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("Logout") {
                        auth.logout()
                    }
                }
            }
        } detail: {
            ZStack {
                // 1. Ambient Website Gradients Background
                AmbientBackground(colorCyan: colorCyan, colorPurple: colorPurple, colorPink: colorPink)
                
                // 2. Main Content Area (Glassmorphic)
                VStack {
                    if selection == "home" {
                        HomeView()
                    } else if selection == "library" {
                        LibraryView()
                    } else {
                        RoomsView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.ultraThinMaterial)
                
                // 3. SyncBeats Floating Action Button
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button(action: {
                            showSyncBeatsModal = true
                        }) {
                            Image(systemName: "opticaldisc")
                                .font(.system(size: 28, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 64, height: 64)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(Color.white.opacity(0.2), lineWidth: 1))
                                .shadow(color: .black.opacity(0.4), radius: 12, x: 0, y: 6)
                        }
                        .buttonStyle(.plain)
                        .padding(32)
                        // Breathing animation for the button
                        .scaleEffect(socket.isConnected ? 1.0 : 0.95)
                        .animation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true), value: socket.isConnected)
                    }
                }
            }
            // Force Dark Mode for the premium glass aesthetic
            .preferredColorScheme(.dark)
        }
        .onAppear {
            socket.connect()
        }
        .sheet(isPresented: $showSyncBeatsModal) {
            SyncBeatsModal(isPresented: $showSyncBeatsModal)
        }
    }
}

// Replicates the Next.js Ambient Blob Background
struct AmbientBackground: View {
    let colorCyan: Color
    let colorPurple: Color
    let colorPink: Color
    
    @State private var animate = false
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            Circle()
                .fill(colorPurple.opacity(0.3))
                .blur(radius: 120)
                .frame(width: 500, height: 500)
                .offset(x: animate ? -200 : 200, y: animate ? -200 : 200)
            
            Circle()
                .fill(colorCyan.opacity(0.2))
                .blur(radius: 120)
                .frame(width: 600, height: 600)
                .offset(x: animate ? 300 : -300, y: animate ? 200 : -200)
            
            Circle()
                .fill(colorPink.opacity(0.2))
                .blur(radius: 100)
                .frame(width: 400, height: 400)
                .offset(x: 0, y: animate ? 300 : -300)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 10).repeatForever(autoreverses: true)) {
                animate = true
            }
        }
    }
}
